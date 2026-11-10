import { ArrowLeft, ArrowRight, LayoutDashboard, Library, Menu, Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const steps = [
  {
    target: '/dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    description:
      'Your learning at a glance. See your enrolled courses, track your progress, and pick up your next lesson right here.',
    mobile:
      'Open the menu at the top left and choose Dashboard for an overview of your enrolled courses, progress, and next lesson.',
  },
  {
    target: '/courses',
    title: 'Explore courses',
    icon: Search,
    description:
      'Find your next skill. Browse the course library, search for a topic, or filter by category. Open a course to see its lessons and enroll.',
    mobile:
      'In the menu, choose Explore courses to browse the library, search for a topic, or filter by category. Open a course to see its lessons and enroll.',
  },
  {
    target: '/my-learning',
    title: 'My learning',
    icon: Library,
    description:
      'Your personal course library. Find everything you’ve enrolled in, check your completion, and return to a course whenever you’re ready.',
    mobile:
      'In the menu, choose My learning to find your enrolled courses, check completion, and return to a course whenever you’re ready.',
  },
];

export function WelcomeTour({ onFinish }: { onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 800px)').matches);
  const [target, setTarget] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(330);
  const step = steps[index]!;
  const Icon = step.icon;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (element.offsetHeight) setCardHeight(element.offsetHeight);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    // The collapsed mobile menu is intentionally never measured or opened by the tour.
    if (mobile) {
      setTarget(null);
      return;
    }
    const element = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    element?.scrollIntoView({ block: 'nearest' });
    const measure = () => {
      if (!element) {
        setTarget(null);
        return;
      }
      const rect = element.getBoundingClientRect();
      setTarget({
        top: rect.top - 5,
        left: rect.left - 5,
        width: rect.width + 10,
        height: rect.height + 10,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const observer = new ResizeObserver(measure);
    if (element) observer.observe(element);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [mobile, step.target]);

  const width = Math.min(420, window.innerWidth - 32);
  const left = target
    ? Math.min(target.left + target.width + 24, window.innerWidth - width - 16)
    : (window.innerWidth - width) / 2;
  const height = cardHeight;
  const top = target
    ? Math.max(16, Math.min(target.top - 8, window.innerHeight - height - 16))
    : Math.max(16, (window.innerHeight - height) / 2);

  return (
    <dialog
      ref={dialog}
      className="welcome-tour"
      aria-labelledby="welcome-tour-title"
      aria-describedby="welcome-tour-description"
      onCancel={(event) => {
        event.preventDefault();
        onFinish();
      }}
    >
      {mobile || !target ? (
        <div className="welcome-tour-shade" aria-hidden="true" />
      ) : (
        <div
          className="welcome-tour-spotlight"
          data-step={step.target}
          style={target}
          aria-hidden="true"
        />
      )}
      <div
        ref={card}
        className={`welcome-tour-card ${mobile ? 'is-mobile' : ''}`}
        style={mobile ? undefined : { width, left: Math.max(16, left), top }}
      >
        <div className="welcome-tour-header">
          <span className="overline">WELCOME TO LEARNOVA</span>
          <button className="icon-button" onClick={onFinish} aria-label="Close welcome guide">
            <X size={19} />
          </button>
        </div>
        <div className="welcome-tour-copy" aria-live="polite" aria-atomic="true">
          <div className="welcome-tour-step">
            <span className="welcome-tour-icon">
              <Icon size={24} />
            </span>
            <span>
              Step {index + 1} of {steps.length}
            </span>
            {mobile && (
              <span className="welcome-tour-menu">
                <Menu size={16} /> In the menu
              </span>
            )}
          </div>
          <h2 id="welcome-tour-title">{step.title}</h2>
          <p id="welcome-tour-description">{mobile ? step.mobile : step.description}</p>
        </div>
        <div className="welcome-tour-dots" aria-hidden="true">
          {steps.map((item, position) => (
            <span key={item.target} className={position === index ? 'active' : ''} />
          ))}
        </div>
        <div className="welcome-tour-actions">
          <button className="welcome-tour-skip" onClick={onFinish}>
            Skip tour
          </button>
          <div>
            <button
              className="button secondary small"
              disabled={index === 0}
              onClick={() => setIndex((value) => value - 1)}
              aria-label="Previous guide step"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              autoFocus
              className="button lime small"
              onClick={() =>
                index === steps.length - 1 ? onFinish() : setIndex((value) => value + 1)
              }
            >
              {index === steps.length - 1 ? 'Got it' : 'Next'}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
