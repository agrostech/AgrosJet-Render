import { useState } from "react";
import { Building2, ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function CompanySwitcher({ 
  companies = [], 
  currentCompanyId, 
  onSwitch,
  collapsed = false 
}) {
  const [open, setOpen] = useState(false);

  // Don't render if user has only one or no companies
  if (!companies || companies.length <= 1) {
    return null;
  }

  const currentCompany = companies.find(c => c.id === currentCompanyId);

  const handleSwitch = (companyId) => {
    if (companyId !== currentCompanyId) {
      onSwitch(companyId);
    }
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={`w-full justify-start gap-2 text-white hover:bg-white/10 ${
            collapsed ? 'px-2' : 'px-3'
          }`}
          data-testid="company-switcher"
        >
          {currentCompany?.logo_url ? (
            <img 
              src={currentCompany.logo_url} 
              alt={currentCompany.name}
              className="w-6 h-6 rounded object-contain flex-shrink-0"
            />
          ) : (
            <div className="w-6 h-6 rounded bg-white/20 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-3.5 h-3.5" />
            </div>
          )}
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-sm truncate">
                {currentCompany?.name || "Şirket Seç"}
              </span>
              <ChevronDown className="w-4 h-4 opacity-60" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="w-56"
        sideOffset={4}
      >
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Şirket Değiştir
        </div>
        {companies.map((company) => (
          <DropdownMenuItem
            key={company.id}
            onClick={() => handleSwitch(company.id)}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-2 w-full">
              {company.logo_url ? (
                <img 
                  src={company.logo_url} 
                  alt={company.name}
                  className="w-6 h-6 rounded object-contain flex-shrink-0"
                />
              ) : (
                <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                </div>
              )}
              <span className="flex-1 truncate">{company.name}</span>
              {company.id === currentCompanyId && (
                <Check className="w-4 h-4 text-primary" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
