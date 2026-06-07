import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: "#0066FF",
          black: "#000000",
          white: "#FFFFFF"
        }
      },
      boxShadow: {
        soft: "0 24px 80px rgba(0,0,0,0.12)"
      }
    }
  },
  plugins: []
};

export default config;
