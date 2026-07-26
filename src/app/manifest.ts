import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes MEDprep installable to the home screen so it opens
 * without browser chrome, like a native app. Served at /manifest.webmanifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MEDprep — PRC Physician Exam Practice",
    short_name: "MEDprep",
    description:
      "Practice for the Philippine Physician Licensure Examination with timed mock exams and untimed study mode.",
    // Signed-in users land straight in the app; the landing page redirects
    // anyone who isn't authenticated to /login.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f8fa",
    theme_color: "#0d7a5f",
    categories: ["education", "medical"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops adaptive icons to a circle/squircle — this variant keeps
      // a wide safe zone so the "M" isn't clipped.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
