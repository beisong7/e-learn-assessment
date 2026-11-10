import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CirclePlay,
  Clock3,
  Compass,
  Layers3,
  MoveUpRight,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { CourseCard, Footer, Logo, PublicHeader, RequestState, SectionHeading } from './components';
import { categories } from './data';
import { useCourseList } from './content-hooks';

export default function Landing() {
  const [category, setCategory] = useState('All courses');
  const result = useCourseList('', category, 1, 3);
  const courses = result.items;
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <PublicHeader />
      <main id="main">
        <section className="hero container">
          <div className="hero-copy">
            <div className="eyebrow-pill">
              <span />A little progress, every day
            </div>
            <h1>
              Big possibilities.
              <br />
              One new <span className="highlight">skill</span>
              <br />
              at a time<span className="lime-dot">.</span>
            </h1>
            <p>
              Make room for what’s next. Discover practical courses, learn at your pace, and turn
              your curiosity into something real.
            </p>
            <div className="hero-actions">
              <Link className="button lime" to="/courses">
                Find your next skill <ArrowUpRight size={19} />
              </Link>
              <a className="watch-link" href="#how-it-works">
                <span>
                  <CirclePlay size={21} />
                </span>
                See how it works
              </a>
            </div>
            <div className="hero-assurance">
              <span>
                <Check size={14} />
                At your own pace
              </span>
              <span>
                <Check size={14} />
                Progress that stays with you
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-photo">
              <img
                src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=1200&q=90"
                alt="A notebook, an open book, and space for a fresh idea"
              />
              <div className="photo-shade" />
              <span className="photo-label">
                <span /> YOUR NEXT CHAPTER STARTS HERE
              </span>
              <div className="photo-caption">
                Stay curious.
                <br />
                Keep growing.
                <MoveUpRight size={38} />
              </div>
            </div>
            <div className="floating-skill">
              <span className="skill-icon">
                <Sparkles size={24} />
              </span>
              <div>
                <small>A LITTLE MOMENTUM</small>
                <strong>Look at you, learning.</strong>
                <p>Your next skill is closer than you think.</p>
              </div>
            </div>
            <div className="floating-progress">
              <span className="progress-check">
                <Check size={18} />
              </span>
              <div>
                <strong>One lesson at a time</strong>
                <small>Small steps add up.</small>
              </div>
              <span className="mini-bars">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
            <span className="orbit-sticker">
              KEEP
              <br />
              <b>GROWING</b>
              <Sparkles size={21} />
            </span>
          </div>
        </section>
        <div className="value-strip">
          <div className="container value-strip-inner">
            <span>LEARNING THAT FITS REAL LIFE</span>
            <div>
              <Compass />
              Follow your curiosity
            </div>
            <div>
              <CirclePlay />
              Learn on your schedule
            </div>
            <div>
              <Layers3 />
              Build one skill at a time
            </div>
          </div>
        </div>
        <section className="container section" id="explore">
          <SectionHeading
            eyebrow="FIND YOUR NEXT CHAPTER"
            title="A new skill looks good on you."
            description="A fresh perspective. A practical skill. Something just for you."
            action={{ label: 'Explore all courses', to: '/courses' }}
          />
          <div className="tabs" aria-label="Filter featured courses">
            {['All courses', ...categories].map((c) => (
              <button
                key={c}
                className={category === c ? 'active' : ''}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <RequestState loading={result.loading} error={result.error} retry={result.reload} />
          <div className="course-grid">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
          <p className="sample-note">
            A preview of our course experience. Course content and instructor profiles are
            illustrative.
          </p>
        </section>
        <section id="why-learnova" className="why-section">
          <div className="container why-grid">
            <div className="why-art">
              <div className="why-art-top">
                <Logo light />
                <span>YOUR PERSONAL LEARNING SPACE</span>
              </div>
              <div className="journey-card">
                <span className="journey-icon">
                  <BookOpen size={24} />
                </span>
                <span className="overline">THE NEXT VERSION OF YOU</span>
                <h3>
                  Starts with
                  <br />
                  “I’m curious.”
                </h3>
                <div className="journey-line">
                  <span />
                  <span />
                  <span />
                  <span />
                  <ArrowRight size={21} />
                </div>
                <p>Explore. Learn. Practice. Repeat.</p>
              </div>
              <span className="art-spark">✳</span>
            </div>
            <div className="why-copy">
              <span className="overline">BUILT AROUND YOU</span>
              <h2>
                Life’s busy.
                <br />
                Learning can fit.
              </h2>
              <p className="section-description">
                You don’t need a perfect plan to get started. Just a little curiosity and a space to
                make it count.
              </p>
              <div className="benefit">
                <span>
                  <Clock3 />
                </span>
                <div>
                  <h3>Your pace is the right pace.</h3>
                  <p>A quiet morning or a quick break. Make learning work with your day.</p>
                </div>
              </div>
              <div className="benefit">
                <span>
                  <CirclePlay />
                </span>
                <div>
                  <h3>Pick up right where you left off.</h3>
                  <p>
                    A learning space designed to keep your place, so you can focus on what’s next.
                  </p>
                </div>
              </div>
              <div className="benefit">
                <span>
                  <Layers3 />
                </span>
                <div>
                  <h3>See the small wins add up.</h3>
                  <p>Clear lessons and visible progress. A little encouragement for every step.</p>
                </div>
              </div>
              <Link className="text-link arrow-link" to="/dashboard">
                Take a look inside <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        </section>
        <section className="container section how-section" id="how-it-works">
          <SectionHeading
            eyebrow="LESS OVERTHINKING. MORE BEGINNING."
            title="Your next chapter, in three steps."
          />
          <div className="steps">
            {[
              {
                title: 'Find your spark.',
                text: 'Explore design, development, data, and business. Start with something that makes you curious.',
                icon: Compass,
              },
              {
                title: 'Make it your own.',
                text: 'Choose a course, settle in, and take it one lesson at a time. There’s no race to the finish.',
                icon: CirclePlay,
              },
              {
                title: 'Keep the momentum.',
                text: 'Return to your learning space, see your progress, and pick up your next lesson.',
                icon: Sparkles,
              },
            ].map((s, i) => (
              <article key={s.title}>
                <div className="step-top">
                  <span>0{i + 1}</span>
                  <s.icon size={25} />
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="container cta-section">
          <div>
            <span className="overline">THERE’S SOMETHING NEXT FOR YOU.</span>
            <h2>
              Meet your
              <br />
              next possibility<span>.</span>
            </h2>
            <p>You bring the curiosity. We’ll make room for the learning.</p>
            <Link to="/register" className="button lime">
              Let’s get started <ArrowUpRight size={18} />
            </Link>
          </div>
          <span className="cta-star" aria-hidden="true">
            ✳
          </span>
          <div className="cta-note">
            A little today.
            <br />
            <span>A little further tomorrow.</span>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
