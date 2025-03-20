"use client";

import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-lg">
      <div className="flex items-center mb-6">
        <Button
          variant="outline"
          size="icon"
          className="mr-6 cursor-pointer"
          onClick={() => window.location.replace("/")}
        >
          <ChevronLeft />
        </Button>
        <h1 className="text-3xl font-bold">À propos d&apos;ATC Lookup</h1>
      </div>
      <p className="text-lg mb-4">
        <strong>ATC Lookup</strong> est un outil permettant, à partir d’un{" "}
        <strong>code ATC</strong>, d’obtenir des <strong>liens directs</strong>{" "}
        vers les fiches médicaments des bases de données de référence.
        Actuellement, seule la{" "}
        <strong>
          <a
            href="https://base-donnees-publique.medicaments.gouv.fr/"
            target="_blank"
            className="text-blue-500 hover:underline"
          >
            Base de Données Publique des Médicaments (BDPM)
          </a>
        </strong>{" "}
        est couverte.
      </p>
      <h2 className="text-2xl font-semibold text-gray-800 mt-6 mb-3">
        Pourquoi ATC Lookup ?
      </h2>
      <p className="text-lg mb-4">
        La base de données publique des médicaments (BDPM) ne permet pas
        d&apos;accéder aux RCP directement via un code ATC{" "}
        <strong>codes ATC</strong>. De nombreux corpus d’informations médicales
        font référence aux codes ATC, ce qui complique l’accès aux informations
        détaillées sur un médicament.{" "}
        <strong>ATC Lookup a été conçu pour pallier cette difficulté</strong> et
        faciliter <strong>l’interopérabilité</strong> des systèmes d’information
        en santé.
      </p>
      <h2 className="text-2xl font-semibold text-gray-800 mt-6 mb-3">
        Technologie et API
      </h2>
      <p className="text-lg mb-4">
        ATC Lookup utilise en partie le{" "}
        <a
          href="https://smt.esante.gouv.fr/"
          target="_blank"
          className="text-blue-500 hover:underline"
        >
          Serveur Multi-Terminologie (SMT)
        </a>
        .
      </p>
      <p className="text-lg mb-4">
        Une <strong>API ouverte</strong> est également disponible :{" "}
        <a
          href="lien_vers_api"
          target="_blank"
          className="text-blue-500 hover:underline"
        >
          Documentation API
        </a>
        .
      </p>
      <h2 className="text-2xl font-semibold text-gray-800 mt-6 mb-3">
        Open source
      </h2>
      <p className="text-lg">
        Développé par{" "}
        <strong>
          <a
            href="https://fr.linkedin.com/in/romain-vandepitterie-9b4a08152"
            target="_blank"
            className="text-blue-500 hover:underline"
          >
            Romain Vandepitterie
          </a>
        </strong>
        , <strong>ATC Lookup</strong> est un projet{" "}
        <strong>open source sous licence MIT</strong>. Son code source est
        accessible ici :{" "}
        <a
          href="https://github.com/v4ndr/atclookup"
          target="_blank"
          className="text-blue-500 hover:underline"
        >
          GitHub
        </a>
        .
      </p>
    </div>
  );
}
