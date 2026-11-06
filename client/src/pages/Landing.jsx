import ArenaTeaser from '../components/landing/ArenaTeaser.jsx';
import ChallengePreview from '../components/landing/ChallengePreview.jsx';
import FinalCta from '../components/landing/FinalCta.jsx';
import Hero from '../components/landing/Hero.jsx';
import HowItWorks from '../components/landing/HowItWorks.jsx';
import LandingFooter from '../components/landing/LandingFooter.jsx';
import RanksSection from '../components/landing/RanksSection.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';

/** Full-bleed landing page (`/`). The hero holds the page's only h1. */
export default function Landing() {
  usePageTitle('');
  return (
    <>
      <Hero />
      <HowItWorks />
      <ChallengePreview />
      <RanksSection />
      <ArenaTeaser />
      <FinalCta />
      <LandingFooter />
    </>
  );
}
