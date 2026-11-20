/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ovec: {
          dark: "#4d0712",
          maroon: "#7c1121",
          crimson: "#98182b",
          gold: "#f59e0b",
          cream: "#faf7f2",
          paper: "#fffdf9",
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"IBM Plex Sans Thai"', "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        soft: "0 4px 20px -2px rgba(77, 7, 18, 0.08)",
        card: "0 2px 12px -2px rgba(77, 7, 18, 0.06)",
      },
    },
  },
  plugins: [],
};
