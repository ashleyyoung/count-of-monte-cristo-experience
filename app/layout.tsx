import type { Metadata } from "next";
import {
  UnifrakturMaguntia,
  Bodoni_Moda,
  EB_Garamond,
  IM_Fell_English,
  Cormorant_Garamond,
  IM_Fell_DW_Pica,
  Pinyon_Script,
} from "next/font/google";
import "./globals.css";
import StyledComponentsRegistry from "@/components/StyledComponentsRegistry";
import { AdminModeProvider } from "@/components/admin/AdminModeProvider";
import AdminModeToggle from "@/components/admin/AdminModeToggle";
import { createClient } from "@/lib/supabase/server";
import { listLinkablePeople } from "@/lib/people";
import { PeopleIndexProvider } from "@/lib/people-linker";

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

/** Masthead / nameplate — blackletter */
const masthead = UnifrakturMaguntia({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-masthead",
  weight: "400",
});

/** Display / headline — high-contrast serif */
const display = Bodoni_Moda({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["400", "500", "700", "900"],
  style: ["normal", "italic"],
});

/** Body / prose */
const body = EB_Garamond({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

/** Buttons / labels — old-style letterpress */
const labels = IM_Fell_English({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-labels",
  weight: "400",
  style: ["normal", "italic"],
});

/** Supporting display */
const supporting = Cormorant_Garamond({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-supporting",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

/** Narrow caption alternate */
const caption = IM_Fell_DW_Pica({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-caption",
  weight: "400",
  style: ["normal", "italic"],
});

/** Period-correct copperplate script — hover citation cards + admin note cards */
const script = Pinyon_Script({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-script",
  weight: "400",
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Le Comte de Monte-Cristo — Journal des Débats",
  description:
    "Follow the original serialization of Alexandre Dumas's masterpiece as it appeared in the Journal des Débats, 1844–1846.",
};

// ---------------------------------------------------------------------------
// Root layout
// ---------------------------------------------------------------------------

const fontVars = [
  masthead.variable,
  display.variable,
  body.variable,
  labels.variable,
  supporting.variable,
  caption.variable,
  script.variable,
].join(" ");

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Resolve admin status server-side so the toggle only renders for admins.
  let isAdmin = false;
  const peoplePromise = listLinkablePeople();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      isAdmin = profile?.role === "admin";
    }
  } catch {
    // Non-fatal — admin mode simply won't appear.
  }

  const people = await peoplePromise;

  return (
    <html lang="fr" className={fontVars}>
      <body>
        <StyledComponentsRegistry>
          <AdminModeProvider isAdmin={isAdmin}>
            <PeopleIndexProvider people={people}>
              {isAdmin && (
                <div
                  style={{
                    position: "fixed",
                    top: 10,
                    right: 14,
                    zIndex: 9999,
                  }}
                >
                  <AdminModeToggle />
                </div>
              )}
              {children}
            </PeopleIndexProvider>
          </AdminModeProvider>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
