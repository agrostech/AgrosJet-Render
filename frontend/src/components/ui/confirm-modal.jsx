import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Trash2, Info } from "lucide-react";

/**
 * Reusable confirmation modal to replace window.confirm()
 * 
 * Usage:
 * const [confirmOpen, setConfirmOpen] = useState(false);
 * const [pendingAction, setPendingAction] = useState(null);
 * 
 * const handleDelete = () => {
 *   setPendingAction(() => () => actualDelete());
 *   setConfirmOpen(true);
 * };
 * 
 * <ConfirmModal
 *   open={confirmOpen}
 *   onOpenChange={setConfirmOpen}
 *   title="Silme Onayı"
 *   description="Bu öğeyi silmek istediğinize emin misiniz?"
 *   onConfirm={() => { pendingAction?.(); setConfirmOpen(false); }}
 *   variant="danger"
 * />
 */

export function ConfirmModal({
  open,
  onOpenChange,
  title = "Onay",
  description = "Bu işlemi gerçekleştirmek istediğinize emin misiniz?",
  confirmText = "Evet",
  cancelText = "Hayır",
  onConfirm,
  variant = "default", // "default" | "danger" | "warning"
  loading = false
}) {
  const getIcon = () => {
    switch (variant) {
      case "danger":
        return <Trash2 className="w-5 h-5 text-red-500" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      default:
        return <Info className="w-5 h-5 text-primary" />;
    }
  };

  const getButtonClass = () => {
    switch (variant) {
      case "danger":
        return "bg-red-600 hover:bg-red-700 text-white";
      case "warning":
        return "bg-amber-600 hover:bg-amber-700 text-white";
      default:
        return "";
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {getIcon()}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2 sm:justify-end">
          <AlertDialogCancel 
            disabled={loading}
            className="mt-0"
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm?.();
            }}
            disabled={loading}
            className={getButtonClass()}
          >
            {loading ? "İşleniyor..." : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Hook for easier usage
import { useState, useCallback } from "react";

export function useConfirmModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState({
    title: "Onay",
    description: "",
    variant: "default",
    onConfirm: () => {}
  });

  const confirm = useCallback(({ title, description, variant = "default" }) => {
    return new Promise((resolve) => {
      setConfig({
        title,
        description,
        variant,
        onConfirm: () => {
          resolve(true);
          setIsOpen(false);
        }
      });
      setIsOpen(true);
    });
  }, []);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
  }, []);

  const ConfirmModalComponent = (
    <ConfirmModal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
      title={config.title}
      description={config.description}
      variant={config.variant}
      onConfirm={config.onConfirm}
    />
  );

  return { confirm, ConfirmModalComponent };
}
