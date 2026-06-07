"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./button";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const enabled = stored ? stored === "dark" : prefersDark;
    setDark(enabled);
    document.documentElement.classList.toggle("dark", enabled);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    window.localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  }

  return (
    <Button variant="secondary" className="h-10 w-10 px-0" onClick={toggle} aria-label="Toggle theme">
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
