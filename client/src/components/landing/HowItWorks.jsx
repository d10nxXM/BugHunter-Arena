import { CodeIcon, PatchIcon, SearchIcon, TrophyIcon } from './icons.jsx';
import SectionHeading, { Container } from './SectionHeading.jsx';

const STEPS = [
  {
    title: 'Pick a challenge',
    text: 'Short Python functions, each with one deliberate bug. Choose by bug class and difficulty.',
    Icon: CodeIcon,
  },
  {
    title: 'Flag the bug',
    text: 'Select the faulty line and explain what breaks. Stuck? Ask the AI mentor for a graded hint.',
    Icon: SearchIcon,
  },
  {
    title: 'Submit the fix',
    text: 'Patch the code. Hidden tests run in your browser, so your fix has to actually work.',
    Icon: PatchIcon,
  },
  {
    title: 'Earn XP & rank up',
    text: 'Your best score on each challenge counts as XP, up to 100 per challenge. Climb the ranks.',
    Icon: TrophyIcon,
  },
];

export default function HowItWorks() {
  return (
    <section aria-labelledby="how-heading">
      <Container className="py-20 sm:py-26">
        <SectionHeading kicker="// how_it_works" id="how-heading" className="mb-14">
          Read. Hunt. Patch. Climb.
        </SectionHeading>
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
          {STEPS.map(({ title, text, Icon }, i) => (
            <li
              key={title}
              className="flex flex-col gap-3.5 rounded-[14px] border border-border bg-surface p-7"
            >
              <span aria-hidden="true" className="font-mono text-sm text-subtle">
                {String(i + 1).padStart(2, '0')}
              </span>
              <Icon />
              <h3 className="font-display text-[21px] font-bold text-heading">{title}</h3>
              <p className="text-[15px] leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
