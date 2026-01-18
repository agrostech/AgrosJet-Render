import { cn } from "@/lib/utils";

const SHIFTJET_LOGO = "https://customer-assets.emergentagent.com/job_kurye-yonetim-2/artifacts/27ukt5rk_shiftjetlogo.png";

export function LoadingSpinner({ className, size = "default", text }) {
  const sizeClasses = {
    sm: "w-8 h-8",
    default: "w-12 h-12",
    lg: "w-16 h-16",
    xl: "w-20 h-20"
  };

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <div className={cn("relative", sizeClasses[size])}>
        <img 
          src={SHIFTJET_LOGO} 
          alt="ShiftJet" 
          className={cn(
            "w-full h-full object-contain animate-spin-slow",
            sizeClasses[size]
          )}
        />
      </div>
      {text && (
        <p className="mt-3 text-sm text-muted-foreground animate-pulse">{text}</p>
      )}
    </div>
  );
}

// Full page loading overlay
export function PageLoading({ text = "Yükleniyor..." }) {
  return (
    <div className="flex items-center justify-center min-h-[50vh] md:min-h-[60vh]">
      <LoadingSpinner size="lg" text={text} />
    </div>
  );
}

// Inline/compact loading for buttons or small areas
export function InlineLoading({ className }) {
  return (
    <img 
      src={SHIFTJET_LOGO} 
      alt="Yükleniyor" 
      className={cn("w-4 h-4 animate-spin-slow inline-block", className)}
    />
  );
}

export default LoadingSpinner;
