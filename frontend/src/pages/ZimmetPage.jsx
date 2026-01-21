import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Package, Plus, Settings, History, FileCheck } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

// Zimmet components
import {
  useZimmetData,
  useMaliBellek,
  ProductsTab,
  MaliBellekTab,
  LogsTab,
  ProductTypesModal,
  AddProductModal,
  EditProductModal,
  AssignModal,
  ReturnModal,
} from "@/components/zimmet";

export default function ZimmetPage() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const { company_id: companyId, id: adminId, username: adminName } = user;

  // Tab state
  const [activeTab, setActiveTab] = useState("products"); // products | mali_bellek | logs
  const [searchQuery, setSearchQuery] = useState("");

  // Modal states
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showEditProduct, setShowEditProduct] = useState(false);
  const [showProductTypes, setShowProductTypes] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Filter states - Products tab
  const [filterAssigned, setFilterAssigned] = useState(false);
  const [filterAvailable, setFilterAvailable] = useState(false);
  const [filterDefective, setFilterDefective] = useState(false);
  const [filterLost, setFilterLost] = useState(false);

  // Filter states - Logs tab
  const [logFilterAssigned, setLogFilterAssigned] = useState(false);
  const [logFilterReturned, setLogFilterReturned] = useState(false);
  const [logFilterDefective, setLogFilterDefective] = useState(false);
  const [logFilterDefectiveRemoved, setLogFilterDefectiveRemoved] = useState(false);
  const [logFilterLost, setLogFilterLost] = useState(false);
  const [logFilterLostRemoved, setLogFilterLostRemoved] = useState(false);
  const [logFilterDeleted, setLogFilterDeleted] = useState(false);

  // Custom hooks for data management
  const zimmetData = useZimmetData(companyId, adminId, adminName);
  const maliBellekData = useMaliBellek(companyId, adminId, adminName, activeTab);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let result = [...zimmetData.products];
    
    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.name?.toLowerCase().includes(q) ||
        p.serial_number?.toLowerCase().includes(q) ||
        p.pos_serial?.toLowerCase().includes(q) ||
        p.pos_terminal?.toLowerCase().includes(q) ||
        p.product_type_name?.toLowerCase().includes(q) ||
        p.assigned_to_courier_name?.toLowerCase().includes(q)
      );
    }
    
    // Checkbox filters
    if (filterAssigned) result = result.filter(p => p.assigned_to_courier_id);
    if (filterAvailable) result = result.filter(p => !p.assigned_to_courier_id);
    if (filterDefective) result = result.filter(p => p.is_defective);
    if (filterLost) result = result.filter(p => p.is_lost);
    
    // Sort: Assigned first, then alphabetical
    result.sort((a, b) => {
      const aAssigned = a.assigned_to_courier_id ? 0 : 1;
      const bAssigned = b.assigned_to_courier_id ? 0 : 1;
      if (aAssigned !== bAssigned) return aAssigned - bAssigned;
      return (a.name || "").localeCompare(b.name || "", 'tr');
    });
    
    return result;
  }, [zimmetData.products, searchQuery, filterAssigned, filterAvailable, filterDefective, filterLost]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    let result = [...zimmetData.logs];
    
    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => 
        l.product_name?.toLowerCase().includes(q) ||
        l.courier_name?.toLowerCase().includes(q) ||
        l.admin_name?.toLowerCase().includes(q) ||
        l.details?.serial_number?.toLowerCase().includes(q) ||
        l.details?.pos_serial?.toLowerCase().includes(q) ||
        l.details?.pos_terminal?.toLowerCase().includes(q)
      );
    }
    
    // Checkbox filters
    const anyLogFilterActive = logFilterAssigned || logFilterReturned || logFilterDefective || 
      logFilterDefectiveRemoved || logFilterLost || logFilterLostRemoved || logFilterDeleted;
    
    if (anyLogFilterActive) {
      result = result.filter(l => {
        if (logFilterAssigned && l.action === 'assigned') return true;
        if (logFilterReturned && l.action === 'returned') return true;
        if (logFilterDefective && l.action === 'product_updated' && l.details?.changes?.includes('Arızalı')) return true;
        if (logFilterDefectiveRemoved && l.action === 'product_updated' && l.details?.changes?.includes('Arıza kaldırıldı')) return true;
        if (logFilterLost && l.action === 'product_updated' && l.details?.changes?.includes('Kayıp')) return true;
        if (logFilterLostRemoved && l.action === 'product_updated' && l.details?.changes?.includes('Kayıp kaldırıldı')) return true;
        if (logFilterDeleted && l.action === 'product_deleted') return true;
        return false;
      });
    }
    
    return result;
  }, [zimmetData.logs, searchQuery, logFilterAssigned, logFilterReturned, logFilterDefective, 
      logFilterDefectiveRemoved, logFilterLost, logFilterLostRemoved, logFilterDeleted]);

  // Edit product handler
  const openEditProduct = (product) => {
    setEditingProduct(product);
    setShowEditProduct(true);
  };

  if (zimmetData.loading) {
    return <PageLoading />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="font-heading text-xl font-bold tracking-tight">Zimmet Yönetimi</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowProductTypes(true)} className="flex-1 sm:flex-none">
            <Settings className="w-4 h-4 sm:mr-1" /> 
            <span className="hidden sm:inline">Ürün Tipleri</span>
          </Button>
          <Button size="sm" onClick={() => setShowAddProduct(true)} className="flex-1 sm:flex-none">
            <Plus className="w-4 h-4 sm:mr-1" /> 
            <span className="hidden sm:inline">Yeni Ürün</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="relative mb-4">
        <div className="overflow-x-auto scrollbar-hide scroll-smooth">
          <div className="flex gap-1 border-b-2 border-slate-200 min-w-max">
            <button
              onClick={() => setActiveTab("products")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
                activeTab === "products" 
                  ? "border-primary text-primary bg-primary/5" 
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-50"
              }`}
              data-testid="zimmet-tab-products"
            >
              <Package className="w-4 h-4" /> Ürünler
            </button>
            <button
              onClick={() => setActiveTab("mali_bellek")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
                activeTab === "mali_bellek" 
                  ? "border-primary text-primary bg-primary/5" 
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-50"
              }`}
              data-testid="zimmet-tab-mali-bellek"
            >
              <FileCheck className="w-4 h-4" /> Mali Bellek
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-[2px] whitespace-nowrap ${
                activeTab === "logs" 
                  ? "border-primary text-primary bg-primary/5" 
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-50"
              }`}
              data-testid="zimmet-tab-logs"
            >
              <History className="w-4 h-4" /> Tüm Hareketler
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "mali_bellek" ? (
        <MaliBellekTab
          maliBellekLoading={maliBellekData.maliBellekLoading}
          selectedYearMonth={maliBellekData.selectedYearMonth}
          setSelectedYearMonth={maliBellekData.setSelectedYearMonth}
          monthOptions={maliBellekData.monthOptions}
          maliBellekSearch={maliBellekData.maliBellekSearch}
          setMaliBellekSearch={maliBellekData.setMaliBellekSearch}
          maliBellekFilterCollected={maliBellekData.maliBellekFilterCollected}
          setMaliBellekFilterCollected={maliBellekData.setMaliBellekFilterCollected}
          maliBellekFilterNotCollected={maliBellekData.maliBellekFilterNotCollected}
          setMaliBellekFilterNotCollected={maliBellekData.setMaliBellekFilterNotCollected}
          filteredMaliBellekData={maliBellekData.filteredMaliBellekData}
          collectedCount={maliBellekData.collectedCount}
          notCollectedCount={maliBellekData.notCollectedCount}
          maliBellekAllLogs={maliBellekData.maliBellekAllLogs}
          toggleMaliBellek={maliBellekData.toggleMaliBellek}
        />
      ) : activeTab === "logs" ? (
        <LogsTab
          logs={zimmetData.logs}
          filteredLogs={filteredLogs}
          totalLogs={zimmetData.totalLogs}
          hasMoreLogs={zimmetData.hasMoreLogs}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          logFilterAssigned={logFilterAssigned}
          setLogFilterAssigned={setLogFilterAssigned}
          logFilterReturned={logFilterReturned}
          setLogFilterReturned={setLogFilterReturned}
          logFilterDefective={logFilterDefective}
          setLogFilterDefective={setLogFilterDefective}
          logFilterDefectiveRemoved={logFilterDefectiveRemoved}
          setLogFilterDefectiveRemoved={setLogFilterDefectiveRemoved}
          logFilterLost={logFilterLost}
          setLogFilterLost={setLogFilterLost}
          logFilterLostRemoved={logFilterLostRemoved}
          setLogFilterLostRemoved={setLogFilterLostRemoved}
          logFilterDeleted={logFilterDeleted}
          setLogFilterDeleted={setLogFilterDeleted}
          loadMoreLogs={zimmetData.loadMoreLogs}
        />
      ) : (
        <ProductsTab
          products={zimmetData.products}
          filteredProducts={filteredProducts}
          totalProducts={zimmetData.totalProducts}
          hasMoreProducts={zimmetData.hasMoreProducts}
          loadingMore={zimmetData.loadingMore}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filterAssigned={filterAssigned}
          setFilterAssigned={setFilterAssigned}
          filterAvailable={filterAvailable}
          setFilterAvailable={setFilterAvailable}
          filterDefective={filterDefective}
          setFilterDefective={setFilterDefective}
          filterLost={filterLost}
          setFilterLost={setFilterLost}
          selectedProduct={zimmetData.selectedProduct}
          setSelectedProduct={zimmetData.setSelectedProduct}
          productHistory={zimmetData.productHistory}
          couriers={zimmetData.couriers}
          loadMoreProducts={zimmetData.loadMoreProducts}
          openEditProduct={openEditProduct}
          handleDeleteProduct={zimmetData.handleDeleteProduct}
          confirmDeleteProduct={zimmetData.confirmDeleteProduct}
          handleToggleDefective={zimmetData.handleToggleDefective}
          handleToggleLost={zimmetData.handleToggleLost}
          setShowAssignModal={setShowAssignModal}
          setShowReturnModal={setShowReturnModal}
        />
      )}

      {/* Modals */}
      <ProductTypesModal
        open={showProductTypes}
        onOpenChange={setShowProductTypes}
        productTypes={zimmetData.productTypes}
        onAddType={zimmetData.handleAddProductType}
        onEditType={zimmetData.handleEditProductType}
        onDeleteType={zimmetData.handleDeleteProductType}
      />

      <AddProductModal
        open={showAddProduct}
        onOpenChange={setShowAddProduct}
        productTypes={zimmetData.productTypes}
        onAddProduct={zimmetData.handleAddProduct}
      />

      <EditProductModal
        open={showEditProduct}
        onOpenChange={setShowEditProduct}
        product={editingProduct}
        productTypes={zimmetData.productTypes}
        onEditProduct={zimmetData.handleEditProduct}
      />

      <AssignModal
        open={showAssignModal}
        onOpenChange={setShowAssignModal}
        product={zimmetData.selectedProduct}
        couriers={zimmetData.couriers}
        onAssign={zimmetData.handleAssign}
      />

      <ReturnModal
        open={showReturnModal}
        onOpenChange={setShowReturnModal}
        product={zimmetData.selectedProduct}
        onReturn={zimmetData.handleReturn}
      />
    </div>
  );
}
