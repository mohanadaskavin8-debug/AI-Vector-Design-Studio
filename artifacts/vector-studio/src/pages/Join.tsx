import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@clerk/react';
import { useAcceptProjectShareLink } from '@workspace/api-client-react';
import { Loader2, CheckCircle2, XCircle, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Join({ params }: { params: { token: string } }) {
  const [, setLocation] = useLocation();
  const { isLoaded, isSignedIn } = useAuth();
  const acceptLink = useAcceptProjectShareLink();
  const fired = useRef(false);

  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(`${base}/join/${params.token}`)}`;

  useEffect(() => {
    // Wait for the auth session to be established before accepting — firing
    // earlier produces a 401 that would misread as an invalid link.
    if (!params.token || !isLoaded || !isSignedIn || fired.current) return;
    fired.current = true;
    acceptLink.mutate({
      data: { token: params.token }
    }, {
      onSuccess: (project) => {
        setTimeout(() => {
          setLocation(`/editor/${project.id}`);
        }, 1500);
      }
    });
  }, [params.token, isLoaded, isSignedIn]);

  const errorStatus = (acceptLink.error as { status?: number } | null)?.status;
  const needsAuth = isLoaded && !isSignedIn;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md p-8 bg-card border border-border/40 rounded-2xl shadow-sm text-center">
        <div className="mb-6 flex justify-center">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Vector Studio" className="w-12 h-12" />
        </div>

        {!isLoaded && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
            <h2 className="text-xl font-semibold mb-2">Checking your session...</h2>
            <p className="text-muted-foreground text-sm">One moment.</p>
          </div>
        )}

        {needsAuth && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <LogIn className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Sign in to join this project</h2>
            <p className="text-muted-foreground text-sm mb-6">
              You have been invited to collaborate. Sign in or create an account, and we will bring you right back to this invitation.
            </p>
            <Button onClick={() => setLocation(signInHref)} variant="default" className="w-full">
              Sign in to continue
            </Button>
          </div>
        )}

        {isLoaded && isSignedIn && (acceptLink.isPending || acceptLink.isIdle) && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
            <h2 className="text-xl font-semibold mb-2">Joining Project...</h2>
            <p className="text-muted-foreground text-sm">Please wait while we set up your access.</p>
          </div>
        )}

        {acceptLink.isSuccess && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Access Granted</h2>
            <p className="text-muted-foreground text-sm">Redirecting you to the project...</p>
          </div>
        )}

        {acceptLink.isError && errorStatus === 401 && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
              <LogIn className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Session Expired</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Your session could not be verified. Sign in again to accept this invitation.
            </p>
            <Button onClick={() => setLocation(signInHref)} variant="default" className="w-full">
              Sign in to continue
            </Button>
          </div>
        )}

        {acceptLink.isError && errorStatus !== 401 && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive mb-4">
              <XCircle className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Link Invalid or Expired</h2>
            <p className="text-muted-foreground text-sm mb-6">
              This share link is no longer valid. You may need to ask the owner for a new link.
            </p>
            <Button onClick={() => setLocation('/projects')} variant="default" className="w-full">
              Return to Projects
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
