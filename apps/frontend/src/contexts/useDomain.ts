import { useContext } from "react";
import { domainContext } from "./domainContext";

export function useDomain() {
  return useContext(domainContext);
}
