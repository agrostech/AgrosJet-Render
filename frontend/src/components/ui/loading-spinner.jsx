import { cn } from "@/lib/utils";

const LOADING_ICON = "https://customer-assets.emergentagent.com/job_37e208cc-89bc-4008-aaad-b9cb8d4fb4af/artifacts/sw3wm7kn_Ads%C4%B1z%20tasar%C4%B1m%20%286%29.png";

export function LoadingSpinner({ className, size = "default" }) {
  const sizeClasses = {
    sm: "w-12 h-12",
    default: "w-16 h-16",
    lg: "w-24 h-24",
    xl: "w-32 h-32"
  };

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <div className={cn("rounded-2xl overflow-hidden bg-black p-3", sizeClasses[size])}>
        <img 
          src={LOADING_ICON} 
          alt="Yükleniyor" 
          className="w-full h-full object-contain animate-spin"
        />
      </div>
    </div>
  );
}

// Full page loading overlay
export function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh] md:min-h-[60vh]">
      <LoadingSpinner size="lg" />
    </div>
  );
}

// Inline/compact loading for buttons or small areas
export function InlineLoading({ className }) {
  return (
    <div className="inline-flex items-center justify-center w-5 h-5 rounded bg-black p-0.5">
      <img 
        src={LOADING_ICON} 
        alt="Yükleniyor" 
        className={cn("w-full h-full animate-spin", className)}
      />
    </div>
  );
}

export default LoadingSpinner;
