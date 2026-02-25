import { cn } from "@/lib/utils";

const LOADING_ICON = "https://customer-assets.emergentagent.com/job_37e208cc-89bc-4008-aaad-b9cb8d4fb4af/artifacts/sw3wm7kn_Ads%C4%B1z%20tasar%C4%B1m%20%286%29.png";

export function LoadingSpinner({ className, size = "default" }) {
  const sizeClasses = {
    sm: "w-12 h-12",
    default: "w-16 h-16",
    lg: "w-20 h-20",
    xl: "w-24 h-24"
  };

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <img 
        src={LOADING_ICON} 
        alt="Yükleniyor" 
        className={cn("object-contain animate-spin", sizeClasses[size])}
      />
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
    <img 
      src={LOADING_ICON} 
      alt="Yükleniyor" 
      className={cn("w-5 h-5 animate-spin inline-block", className)}
    />
  );
}

export default LoadingSpinner;
