"use client";
import { usePathname } from "next/navigation";
// Les landing pages (/lp/...) n'ont ni en-tête ni pied de page du site.
export default function Chrome({ header, footer, children }) {
  const lp = (usePathname() || "").startsWith("/lp/");
  return (<>{!lp && header}<main>{children}</main>{!lp && footer}</>);
}
