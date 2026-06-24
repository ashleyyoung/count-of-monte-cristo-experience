"use client";

import styled, { keyframes } from "styled-components";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const mcGlow = keyframes`
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50%       { opacity: 0.85; transform: scale(1.08); }
`;

// ---------------------------------------------------------------------------
// Page wrapper
// ---------------------------------------------------------------------------

const Page = styled.div`
  min-height: 100vh;
  background: var(--paper-base);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

// ---------------------------------------------------------------------------
// Masthead strip
// ---------------------------------------------------------------------------

const MastheadStrip = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 14px 60px 10px;
  border-bottom: 1px solid var(--rule-strong);
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-tertiary);
  letter-spacing: 0.04em;

  @media (max-width: 600px) {
    padding: 12px 20px 8px;
    font-size: 11px;
  }
`;

const MastheadCenter = styled.span`
  font-family: var(--font-labels-stack);
  font-style: normal;
  font-size: 13px;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--ink-secondary);
`;

// ---------------------------------------------------------------------------
// Nameplate
// ---------------------------------------------------------------------------

const Nameplate = styled.h1`
  font-family: var(--font-masthead-stack);
  font-size: clamp(36px, 5vw, 58px);
  font-weight: 400;
  color: var(--ink-primary);
  letter-spacing: 1px;
  text-align: center;
  margin: 16px 0 6px;
  line-height: 1;
  padding: 0 20px;
`;

// ---------------------------------------------------------------------------
// Subtitle band
// ---------------------------------------------------------------------------

const SubtitleBand = styled.div`
  text-align: center;
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 14px;
  color: var(--ink-tertiary);
  letter-spacing: 2px;
  text-transform: uppercase;
  border-top: 1px solid var(--rule-strong);
  border-bottom: 3px double var(--rule-strong);
  padding: 6px 0;
  margin: 0 60px;

  @media (max-width: 600px) {
    margin: 0 20px;
    font-size: 12px;
  }
`;

// ---------------------------------------------------------------------------
// Hero section (lamp glow container)
// ---------------------------------------------------------------------------

const HeroWrapper = styled.div`
  position: relative;
  flex: 1;
  padding: 0 60px 80px;
  overflow: hidden;

  @media (max-width: 900px) {
    padding: 0 20px 60px;
  }
`;

const LampGlow = styled.div`
  position: absolute;
  top: -80px;
  left: 50%;
  transform: translateX(-50%);
  width: 520px;
  height: 420px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at 50% 20%,
    rgba(201, 162, 75, 0.28) 0%,
    rgba(201, 162, 75, 0.10) 40%,
    transparent 72%
  );
  pointer-events: none;
  animation: ${mcGlow} 5s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const HeroGrid = styled.div`
  display: grid;
  grid-template-columns: 1.55fr 1fr;
  gap: 40px;
  padding-top: 34px;
  position: relative;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: 28px;
  }
`;

// ---------------------------------------------------------------------------
// Hero left — text column
// ---------------------------------------------------------------------------

const HeroLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
`;

const Kicker = styled.p`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-tertiary);
  margin: 0;
`;

const NovelTitle = styled.h2`
  font-family: var(--font-display-stack);
  font-weight: 700;
  font-size: clamp(42px, 4.5vw, 62px);
  line-height: 0.96;
  color: var(--ink-primary);
  letter-spacing: -0.5px;
  margin: 0;
`;

const TitleEmphasis = styled.span`
  font-weight: 500;
  font-style: italic;
  display: block;
`;

const Tagline = styled.p`
  font-family: var(--font-body-stack);
  font-size: 18px;
  line-height: 1.55;
  color: var(--ink-secondary);
  max-width: 38rem;
  margin: 0;
`;

const CtaRow = styled.div`
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 6px;
`;

const CtaPrimary = styled(Link)`
  display: inline-block;
  padding: 10px 26px;
  background: var(--ink-primary);
  color: var(--paper-base);
  font-family: var(--font-labels-stack);
  font-size: 13px;
  font-style: italic;
  letter-spacing: 0.12em;
  text-decoration: none;
  border: 1px solid var(--ink-primary);
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--oxblood);
    border-color: var(--oxblood);
    color: var(--paper-base);
  }
`;

const CtaSecondary = styled(Link)`
  display: inline-block;
  padding: 10px 26px;
  background: transparent;
  color: var(--ink-secondary);
  font-family: var(--font-labels-stack);
  font-size: 13px;
  font-style: italic;
  letter-spacing: 0.12em;
  text-decoration: none;
  border: 1px solid var(--rule-mid);
  transition: border-color 0.15s, color 0.15s;

  &:hover {
    border-color: var(--ink-secondary);
    color: var(--ink-primary);
  }
`;

// ---------------------------------------------------------------------------
// Hero right — engraving plate
// ---------------------------------------------------------------------------

const HeroRight = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  @media (max-width: 900px) {
    display: none;
  }
`;

const EngravingPlate = styled(motion.div)`
  border: 1px solid var(--ink-muted);
  padding: 8px;
  background: var(--paper-feature);
  box-shadow:
    0 8px 24px rgba(29, 20, 10, 0.22),
    0 2px 6px rgba(29, 20, 10, 0.12),
    inset 0 0 0 1px rgba(201, 162, 75, 0.18);
  max-width: 280px;
  width: 100%;
`;

const EngravingSvg = styled.svg`
  display: block;
  width: 100%;
  height: auto;
  background: var(--paper-feature);
`;

const BrassPlaque = styled.div`
  text-align: center;
  font-family: var(--font-labels-stack);
  font-size: 11px;
  font-style: italic;
  color: var(--gilt-deep);
  letter-spacing: 0.14em;
  border-top: 1px solid var(--gilt-warm);
  padding-top: 8px;
  width: 100%;
  max-width: 280px;
`;

// ---------------------------------------------------------------------------
// Feuilleton strip (bottom)
// ---------------------------------------------------------------------------

const FeuilletonStrip = styled.footer`
  position: relative;
  border-top: 2px solid var(--rule-strong);
  background: linear-gradient(var(--paper-deep), #dccda8);
  padding: 14px 60px 18px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  font-family: var(--font-body-stack);
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--ink-secondary);

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
    padding: 14px 20px 18px;
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const FeuilletonCol = styled.div``;

const FeuilletonHead = styled.p`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-tertiary);
  margin-bottom: 5px;
  border-bottom: 1px solid var(--rule-light);
  padding-bottom: 4px;
`;

// ---------------------------------------------------------------------------
// Inline SVG engraving (placeholder until actual scan is on R2)
// ---------------------------------------------------------------------------

function EngravingIllustration() {
  return (
    <EngravingSvg viewBox="0 0 264 340" xmlns="http://www.w3.org/2000/svg">
      {/* Outer frame */}
      <rect x="2" y="2" width="260" height="336" fill="none" stroke="#6b5236" strokeWidth="1.2" />
      <rect x="8" y="8" width="248" height="324" fill="none" stroke="#b9a578" strokeWidth="0.5" />

      {/* Sea horizon */}
      <rect x="10" y="10" width="244" height="240" fill="#e9dec4" />
      {/* Water hatching */}
      {Array.from({ length: 18 }).map((_, i) => (
        <line key={i} x1="10" y1={180 + i * 4} x2="254" y2={180 + i * 4}
          stroke="#8a6f47" strokeWidth="0.3" opacity="0.5" />
      ))}
      {/* Sky hatching */}
      {Array.from({ length: 10 }).map((_, i) => (
        <line key={i} x1="10" y1={40 + i * 6} x2="254" y2={40 + i * 6}
          stroke="#b9a578" strokeWidth="0.2" opacity="0.3" />
      ))}

      {/* Island silhouette */}
      <path d="M60 180 Q90 140 132 145 Q174 140 204 180 Z"
        fill="#5b4631" opacity="0.75" />

      {/* Figure — the Count on cliff */}
      <line x1="132" y1="145" x2="132" y2="108" stroke="#3b2e1d" strokeWidth="1.5" />
      <ellipse cx="132" cy="104" rx="5" ry="6" fill="#3b2e1d" />
      <path d="M126 120 Q132 112 138 120" fill="none" stroke="#3b2e1d" strokeWidth="1" />

      {/* Sailing ship */}
      <line x1="200" y1="172" x2="200" y2="148" stroke="#5b4631" strokeWidth="0.8" />
      <path d="M200 148 L220 162 L200 172 Z" fill="#8a6f47" opacity="0.6" />
      <path d="M200 148 L183 160 L200 170 Z" fill="#b9a578" opacity="0.5" />

      {/* Title cartouche */}
      <rect x="30" y="256" width="204" height="68" rx="2" fill="#e2d6ba" stroke="#8a6f47" strokeWidth="0.8" />
      <line x1="36" y1="268" x2="228" y2="268" stroke="#b9a578" strokeWidth="0.5" />
      <line x1="36" y1="316" x2="228" y2="316" stroke="#b9a578" strokeWidth="0.5" />

      {/* Cartouche text rendered as paths/labels */}
      <text x="132" y="287" textAnchor="middle" fill="#3b2e1d"
        fontFamily="Georgia, serif" fontStyle="italic" fontSize="11" letterSpacing="1">
        Le Comte
      </text>
      <text x="132" y="302" textAnchor="middle" fill="#a07f30"
        fontFamily="Georgia, serif" fontStyle="italic" fontSize="13" letterSpacing="0.5">
        de Monte-Cristo
      </text>
      <text x="132" y="313" textAnchor="middle" fill="#6b5236"
        fontFamily="Georgia, serif" fontSize="8" letterSpacing="2">
        ALEXANDRE DUMAS
      </text>
    </EngravingSvg>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LandingPage() {
  const reduceMotion = useReducedMotion();

  const plateVariants = {
    initial: { rotate: -4, filter: "drop-shadow(0 22px 26px rgba(0,0,0,0.5))" },
    hover: reduceMotion
      ? {}
      : { rotate: -2, filter: "drop-shadow(0 28px 32px rgba(0,0,0,0.55))", scale: 1.02 },
  };

  return (
    <Page>
      {/* Masthead strip */}
      <MastheadStrip>
        <span>N.º 1 — Journal des Débats</span>
        <MastheadCenter>Paris</MastheadCenter>
        <span>28 Août 1844</span>
      </MastheadStrip>

      {/* Nameplate */}
      <Nameplate>Journal des Débats Politiques et Littéraires</Nameplate>

      {/* Subtitle double-rule band */}
      <SubtitleBand>
        Feuilleton du Journal des Débats · Sérialisé 1844–1846
      </SubtitleBand>

      {/* Hero */}
      <HeroWrapper>
        {!reduceMotion && <LampGlow aria-hidden />}

        <HeroGrid>
          {/* Left — text */}
          <HeroLeft>
            <Kicker>Feuilleton — Roman nouveau</Kicker>

            <NovelTitle>
              Le Comte
              <TitleEmphasis>de Monte-Cristo</TitleEmphasis>
            </NovelTitle>

            <Tagline>
              Follow the original serialization of Alexandre Dumas&apos;s
              masterpiece exactly as Parisian readers experienced it — one
              newspaper installment at a time, with the cultural context of
              each day&apos;s issue of the <em>Journal des Débats</em>.
            </Tagline>

            <CtaRow>
              <CtaPrimary href="/timeline">
                Begin the serialization
              </CtaPrimary>
              <CtaSecondary href="/debats">
                Journal des Débats
              </CtaSecondary>
            </CtaRow>
          </HeroLeft>

          {/* Right — engraving plate */}
          <HeroRight>
            <EngravingPlate
              initial="initial"
              whileHover="hover"
              variants={plateVariants}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
              <EngravingIllustration />
            </EngravingPlate>
            <BrassPlaque>
              Frontispiece · Édition originale, 1844
            </BrassPlaque>
          </HeroRight>
        </HeroGrid>
      </HeroWrapper>

      {/* Feuilleton strip */}
      <FeuilletonStrip>
        <FeuilletonCol>
          <FeuilletonHead>Roman-feuilleton</FeuilletonHead>
          <p>
            Paraissant chaque jour dans nos colonnes, le roman de M. Dumas
            tient le Paris lettré en haleine depuis le 28 août dernier.
          </p>
        </FeuilletonCol>
        <FeuilletonCol>
          <FeuilletonHead>Chronique littéraire</FeuilletonHead>
          <p>
            Les critiques du Journal suivent l&apos;œuvre au fil de sa
            publication — théâtre, musique, arts, lettres et sciences.
          </p>
        </FeuilletonCol>
        <FeuilletonCol>
          <FeuilletonHead>Galignani&apos;s Messenger</FeuilletonHead>
          <p>
            Nouvelles d&apos;Angleterre et d&apos;Amérique telles
            qu&apos;elles parvenaient à Paris durant la sérialisation.
          </p>
        </FeuilletonCol>
        <FeuilletonCol>
          <FeuilletonHead>Sciences &amp; Découvertes</FeuilletonHead>
          <p>
            Rapports de l&apos;Académie des sciences, expériences de
            Foucault, Donné et leurs contemporains parisiens.
          </p>
        </FeuilletonCol>
      </FeuilletonStrip>
    </Page>
  );
}
