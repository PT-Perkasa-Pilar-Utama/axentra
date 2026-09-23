import type React from "react";
import perkasaLogo from "../../assets/perkasa-logo.png";

export function PerkasaLogo(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center" data-testid="perkasa-logo">
      <img
        src={perkasaLogo}
        alt="PERKASA - Innovation Towards Intelligence"
        className="h-20 sm:h-24 w-auto object-contain max-w-[280px] select-none"
      />
    </div>
  );
}

export function PerkasaBackgroundDecorations(): React.JSX.Element {
  return (
    <>
      <svg
        className="pointer-events-none absolute -bottom-24 -left-24 h-[500px] w-[500px] text-slate-200/50"
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle
          cx="100"
          cy="300"
          r="280"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <circle cx="100" cy="300" r="220" stroke="currentColor" strokeWidth="1" />
        <circle
          cx="100"
          cy="300"
          r="160"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <circle cx="100" cy="300" r="100" stroke="currentColor" strokeWidth="1" />
      </svg>

      <svg
        className="pointer-events-none absolute -top-32 -right-32 h-[600px] w-[600px] text-slate-200/40"
        viewBox="0 0 500 500"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M 500 0 C 350 100 300 300 450 450 C 600 600 500 200 500 0 Z"
          fill="currentColor"
          opacity="0.4"
        />
      </svg>
    </>
  );
}
