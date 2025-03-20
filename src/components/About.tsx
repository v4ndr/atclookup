"use client";

type AboutProps = {
  className?: string;
};

const About = ({ className }: AboutProps) => {
  return (
    <div
      className={`w-full flex items-center justify-center h-min ${className}`}
    >
      <p
        className="text-sm text-gray-500 text-center cursor-pointer hover:underline"
        onClick={() => window.location.replace("/about")}
      >
        À propos
      </p>
    </div>
  );
};

export default About;
