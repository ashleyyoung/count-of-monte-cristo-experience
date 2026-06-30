"use client";

/**
 * Recursively links recognized people's names inside mixed JSX (strings,
 * <em>, <Cite>, etc.). Use inside editorial paragraphs that aren't rendered
 * through render-prose.
 */

import React, { useMemo, useRef } from "react";
import type { ReactNode } from "react";
import {
  linkNamesInText,
  usePeopleIndex,
  type NameIndex,
} from "@/lib/people-linker";

function linkPeopleInNodes(
  node: ReactNode,
  index: NameIndex | null,
  seen: Set<string>,
  keyPrefix: string,
): ReactNode {
  if (node == null || typeof node === "boolean") return node;
  if (typeof node === "string") {
    if (!index?.regex) return node;
    return linkNamesInText(node, index, seen, keyPrefix);
  }
  if (typeof node === "number") return node;
  if (Array.isArray(node)) {
    return node.map((child, i) =>
      linkPeopleInNodes(child, index, seen, `${keyPrefix}${i}-`),
    );
  }
  if (React.isValidElement(node)) {
    const childProps = node.props as { children?: ReactNode };
    if (childProps.children == null) return node;
    return React.cloneElement(
      node,
      {},
      linkPeopleInNodes(childProps.children, index, seen, `${keyPrefix}c-`),
    );
  }
  return node;
}

export default function PeopleLinked({ children }: { children: ReactNode }) {
  const index = usePeopleIndex();
  const seenRef = useRef(new Set<string>());

  return useMemo(() => {
    seenRef.current.clear();
    return linkPeopleInNodes(children, index, seenRef.current, "pl-");
  }, [children, index]);
}
