import { useEffect, useRef, ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Route, Switch, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/error-boundary';

import Home from '@/pages/Home';
import Projects from '@/pages/Projects';
import Editor from '@/pages/Editor';
import { CloudProjectProvider } from '@/cloud/CloudProjectProvider';
import Join from '@/pages/Join';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// In production the API server proxies Clerk's Frontend API same-origin at
// /api/__clerk (see the server's clerkProxyMiddleware), so session cookies are
// first-party and usable by the API. In development the server proxy is
// disabled and Clerk's dev-instance flow talks to Clerk directly.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL
  || (import.meta.env.PROD ? `${window.location.origin}/api/__clerk` : undefined);
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(262, 83%, 58%)",
    colorForeground: "hsl(240, 10%, 4%)",
    colorMutedForeground: "hsl(240, 5%, 45%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorBackground: "hsl(0, 0%, 100%)",
    colorInput: "hsl(240, 5%, 98%)",
    colorInputForeground: "hsl(240, 10%, 4%)",
    colorNeutral: "hsl(240, 5%, 90%)",
    fontFamily: "Plus Jakarta Sans, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-background rounded-2xl w-[440px] max-w-full overflow-hidden border border-border/40 shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground",
    footerActionLink: "text-primary hover:text-primary/90 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-primary",
    alertText: "text-destructive-foreground",
    logoBox: "h-12 flex justify-center",
    logoImage: "h-8 w-auto object-contain",
    socialButtonsBlockButton: "border-border/40 bg-muted/10 hover:bg-muted/30 text-foreground",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm",
    formFieldInput: "bg-muted/30 border-border/40 text-foreground focus:ring-primary/70 focus:border-primary",
    footerAction: "bg-muted/10",
    dividerLine: "bg-border/40",
    alert: "bg-destructive text-destructive-foreground border-destructive/20",
    otpCodeFieldInput: "bg-muted/30 border-border/40 text-foreground focus:ring-primary",
    formFieldRow: "mb-4",
    main: "px-8 py-6",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/20">
      <header className="px-6 py-4 flex items-center justify-start border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <a href={basePath || "/"} className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80">
          <img src={`${basePath}/logo.svg`} alt="Vector Studio" className="w-6 h-6" />
          <span className="font-semibold tracking-tight">Vector Studio</span>
        </a>
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/20">
      <header className="px-6 py-4 flex items-center justify-start border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <a href={basePath || "/"} className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80">
          <img src={`${basePath}/logo.svg`} alt="Vector Studio" className="w-6 h-6" />
          <span className="font-semibold tracking-tight">Vector Studio</span>
        </a>
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/projects" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function ProtectedProjects() {
  return (
    <>
      <Show when="signed-in">
        <Projects />
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ProtectedEditor({ params }: { params: { projectId: string } }) {
  return (
    <>
      <Show when="signed-in">
        <CloudProjectProvider key={params.projectId} projectId={params.projectId}><Editor /></CloudProjectProvider>
      </Show>
      <Show when="signed-out">
        <Redirect to={`/sign-in`} />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access your projects",
          },
        },
        signUp: {
          start: {
            title: "Start creating",
            subtitle: "Join Vector Studio today",
          },
        },
      }}
      routerPush={(to: string) => setLocation(stripBase(to))}
      routerReplace={(to: string) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/projects" component={ProtectedProjects} />
            <Route path="/editor/:projectId" component={ProtectedEditor} />
            <Route path="/join/:token" component={Join} />
            <Route path="/local" component={Editor} />
            <Route component={NotFound} />
          </Switch>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <RoutedErrorBoundary>
        <ClerkProviderWithRoutes />
        <Toaster />
      </RoutedErrorBoundary>
    </WouterRouter>
  );
}

export default App;