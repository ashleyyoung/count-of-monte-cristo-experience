"use client";

import { Fragment } from "react";
import Link from "next/link";
import styled from "styled-components";

export type BreadcrumbCrumb = {
  label: string;
  href?: string;
};

const Trail = styled.nav`
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-muted);

  a {
    color: var(--ink-muted);
    text-decoration: none;
    white-space: nowrap;

    &:hover {
      color: var(--ink-primary);
    }
  }

  span[aria-hidden="true"] {
    color: var(--rule-mid);
    flex-shrink: 0;
  }

  [data-current] {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

interface Props {
  crumbs: BreadcrumbCrumb[];
  className?: string;
}

export default function BreadcrumbBar({ crumbs, className }: Props) {
  return (
    <Trail className={className} aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => (
        <Fragment key={`${crumb.label}-${i}`}>
          {i > 0 && <span aria-hidden="true">/</span>}
          {crumb.href ? (
            <Link href={crumb.href}>{crumb.label}</Link>
          ) : (
            <span data-current>{crumb.label}</span>
          )}
        </Fragment>
      ))}
    </Trail>
  );
}
