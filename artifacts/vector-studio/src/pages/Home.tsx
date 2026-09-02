import { Link } from 'wouter';
import { ArrowRight, PenTool, Layout, Cloud, Lock } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b border-border/40 sticky top-0 bg-background/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Vector Studio" className="w-8 h-8" />
          <span className="font-semibold text-lg tracking-tight">Vector Studio</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/local" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Try Local
          </Link>
          <Link href="/sign-in" className="text-sm font-medium hover:text-primary transition-colors">
            Sign In
          </Link>
          <Link href="/sign-up" className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-medium transition-colors shadow-sm">
            Get Started
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center">
        <section className="w-full max-w-5xl mx-auto px-6 py-24 md:py-32 flex flex-col items-center text-center">
          <div className="inline-flex items-center rounded-full border border-border/40 bg-muted/30 px-3 py-1 text-sm font-medium text-muted-foreground mb-8">
            <span className="flex h-2 w-2 rounded-full bg-primary mr-2"></span>
            Professional Creative Platform
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 max-w-4xl text-balance">
            Design with precision. <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">Scale with confidence.</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl text-balance leading-relaxed">
            The definitive vector editing environment for modern teams. Built for performance, crafted for focus, and designed to get out of your way.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
            <Link href="/sign-up" className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-4 rounded-md text-base font-semibold transition-all shadow-md flex items-center gap-2 w-full sm:w-auto justify-center">
              Start Creating <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/local" className="bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border/40 px-8 py-4 rounded-md text-base font-medium transition-colors w-full sm:w-auto justify-center flex items-center">
              Open Local Editor
            </Link>
          </div>
        </section>

        <section className="w-full border-t border-border/40 bg-muted/10 py-24">
          <div className="max-w-5xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="flex flex-col gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <PenTool className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold">Uncompromised Tools</h3>
              <p className="text-muted-foreground leading-relaxed">A full suite of professional vector tools engineered for exact control and fluid expression.</p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Cloud className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold">Cloud Sync</h3>
              <p className="text-muted-foreground leading-relaxed">Your projects stay in perfect sync across all your devices. Never lose a revision again.</p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold">Local-First Safety</h3>
              <p className="text-muted-foreground leading-relaxed">Want complete privacy? Use the local editor without an account. Your files never leave your machine.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-8 border-t border-border/40 px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground bg-background">
        <div>&copy; {new Date().getFullYear()} Vector Studio. All rights reserved.</div>
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
          <a href="#" className="hover:text-foreground transition-colors">Contact</a>
        </div>
      </footer>
    </div>
  );
}