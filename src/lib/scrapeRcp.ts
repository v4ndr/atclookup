import * as cheerio from "cheerio";
import https from "node:https";
import http from "node:http";

export type RcpSection = {
  title: string;
  content: string;
  children: RcpSection[];
};

export type RcpResult = {
  name: string;
  sections: RcpSection[];
};

/** Fetch a single URL, following redirects, ignoring SSL cert errors (BDPM has incomplete cert chain) */
function fetchOnce(url: string): Promise<string> {
  const mod = url.startsWith("https") ? https : http;
  const opts = url.startsWith("https")
    ? { rejectUnauthorized: false, timeout: 15_000 }
    : { timeout: 15_000 };
  return new Promise((resolve, reject) => {
    const req = mod.get(url, opts, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchOnce(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode && res.statusCode >= 400) {
        return reject(new Error(`Failed to fetch RCP: ${res.statusCode}`));
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

const MAX_RETRIES = 3;

/** Fetch URL with retries and exponential backoff for transient BDPM failures */
async function fetchBdpm(url: string): Promise<string> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fetchOnce(url);
    } catch (err) {
      lastError = err as Error;
      const msg = lastError.message;
      // Don't retry on 4xx (client errors) — only on 5xx, timeouts, and network errors
      if (msg.includes("Failed to fetch RCP: 4")) throw lastError;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

/** Check if a BDPM page loads successfully (has any content) */
export async function bdpmPageExists(url: string): Promise<boolean> {
  try {
    const html = await fetchBdpm(url);
    return html.length > 0;
  } catch {
    return false;
  }
}

export async function scrapeRcp(url: string): Promise<RcpResult> {
  const html = await fetchBdpm(url);
  const $ = cheerio.load(html);

  // Find the container holding AmmAnnexeTitre1 elements
  // Structure: #tabpanel-rcp-panel > .fr-container > .fr-grid-row > div.fr-col-12
  // or directly #tabpanel-rcp-panel with children (older layout)
  const firstTitre = $(".AmmAnnexeTitre1").first();
  if (firstTitre.length === 0) {
    throw new Error("RCP content not found on page");
  }
  const container = firstTitre.parent();

  const sections: RcpSection[] = [];
  let currentSection: RcpSection | null = null;
  let currentChild: RcpSection | null = null;

  container.children().each((_, el) => {
    const $el = $(el);
    const className = $el.attr("class") || "";

    if (className.includes("AmmAnnexeTitre1")) {
      currentChild = null;
      currentSection = {
        title: $el.text().trim(),
        content: "",
        children: [],
      };
      sections.push(currentSection);
    } else if (className.includes("AmmAnnexeTitre2")) {
      currentChild = {
        title: $el.text().trim(),
        content: "",
        children: [],
      };
      if (currentSection) {
        currentSection.children.push(currentChild);
      }
    } else if (className.startsWith("Amm")) {
      // Only accumulate Amm* content classes, skip tooltips/nav elements
      const htmlContent = $.html($el);
      if (currentChild) {
        currentChild.content += htmlContent;
      } else if (currentSection) {
        currentSection.content += htmlContent;
      }
    }
  });

  // Extract medication name from DENOMINATION section content
  const denomSection = sections.find((s) => s.title.includes("DENOMINATION"));
  const name = denomSection?.content
    ? cheerio.load(denomSection.content).text().trim()
    : "";

  return { name, sections };
}
