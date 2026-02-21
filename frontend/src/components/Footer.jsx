export default function Footer({ className = "" }) {
  return (
    <footer className={`bg-white border-t py-3 text-center text-xs text-muted-foreground ${className}`}>
      © 2026 AgrosJet. Tüm hakları saklıdır. Powered by AgrosJet.
    </footer>
  );
}
