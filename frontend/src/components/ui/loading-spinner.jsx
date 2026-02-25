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
    <div className={cn("flex items-center justify-center", className)}>
      <img 
        src={LOADING_ICON} 
        alt="Yükleniyor" 
        className={cn("animate-spin", sizeClasses[size])}
      />
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh] md:min-h-[60vh]">
      <LoadingSpinner size="lg" />
    </div>
  );
}

export function InlineLoading({ className }) {
  return (
    <img 
      src={LOADING_ICON} 
      alt="Yükleniyor" 
      className={cn("w-5 h-5 animate-spin", className)}
    />
  );
}

export default LoadingSpinner;
