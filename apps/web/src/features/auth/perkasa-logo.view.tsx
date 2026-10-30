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
