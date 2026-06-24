"use client";

import React, { useRef, useState } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { ServerStyleSheet, StyleSheetManager } from "styled-components";

/**
 * Collects styled-components styles during SSR and injects them into <head>
 * via useServerInsertedHTML. Required for the Next.js App Router.
 */
export default function StyledComponentsRegistry({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sheet] = useState(() => new ServerStyleSheet());
  const flushedRef = useRef(false);

  useServerInsertedHTML(() => {
    if (flushedRef.current) return null;
    flushedRef.current = true;
    const styles = sheet.getStyleElement();
    sheet.seal();
    return styles;
  });

  if (typeof window !== "undefined") {
    return <>{children}</>;
  }

  return (
    <StyleSheetManager sheet={sheet.instance}>{children}</StyleSheetManager>
  );
}
