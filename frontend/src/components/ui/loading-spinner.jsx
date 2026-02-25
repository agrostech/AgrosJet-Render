import { cn } from "@/lib/utils";

const LOADING_ICON = "https://customer-assets.emergentagent.com/job_37e208cc-89bc-4008-aaad-b9cb8d4fb4af/artifacts/sw3wm7kn_Ads%C4%B1z%20tasar%C4%B1m%20%286%29.png";

export function LoadingSpinner({ className, size = "default" }) {
  const sizeClasses = {
    sm: "w-16 h-16",
    default: "w-20 h-20",
    lg: "w-28 h-28",
    xl: "w-36 h-36"
  };

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <div className={cn("rounded-2xl overflow-hidden", sizeClasses[size])}>
        <img 
          src={LOADING_ICON} 
          alt="Yükleniyor" 
          className="w-full h-full object-cover animate-spin"
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
    <div className="inline-flex items-center justify-center w-6 h-6 rounded overflow-hidden">
      <img 
        src={LOADING_ICON} 
        alt="Yükleniyor" 
        className={cn("w-full h-full object-cover animate-spin", className)}
      />
    </div>
  );
}

export default LoadingSpinner;
