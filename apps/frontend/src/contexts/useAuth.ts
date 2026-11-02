import { useContext } from "react";
import { authContext } from "./authContext";

// Hooks live outside the provider module so Fast Refresh can preserve provider
// state when a hook-only edit is made during local development.
export function useAuth() {
  const ctx = useContext(authContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
