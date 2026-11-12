"use client";

import { useEffect } from "react";

/** Non-blocking Morrison load - never stalls first paint on 3G. */
export function FontLoader() {
  useEffect(() => {
    const id = "morrison-font";
    if (document.getElementById(id)) return;

    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.cdnfonts.com/css/morrison";
    link.media = "print";
    link.onload = () => {
      link.media = "all";
    };
    document.head.appendChild(link);
  }, []);

  return null;
}
