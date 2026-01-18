import { useRef } from "react";
import { Search, Package, User, History, Pencil, Trash2, AlertTriangle, XCircle, ArrowLeftRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate, getActionLabel, getActionColor } from "./zimmetHelpers";

export function ProductsTab({
  products,
  filteredProducts,
  totalProducts,
  hasMoreProducts,
  loadingMore,
  searchQuery,
  setSearchQuery,
  filterAssigned,
  setFilterAssigned,
  filterAvailable,
  setFilterAvailable,
  filterDefective,
  setFilterDefective,
  filterLost,
  setFilterLost,
  selectedProduct,
  setSelectedProduct,
  productHistory,
  couriers,
  loadMoreProducts,
  openEditProduct,
  handleDeleteProduct,
  handleToggleDefective,
  handleToggleLost,
  setShowAssignModal,
  setShowReturnModal,
}) {
  const listRef = useRef(null);

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {/* Left Panel - List */}
      <div className="w-full lg:w-1/2 border-2 border-border bg-white flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
        <div className="p-3 border-b-2 border-border bg-slate-50 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="font-heading font-bold text-sm flex items-center gap-2">
              <Package className="w-4 h-4" />
              Ürünler ({filteredProducts.length})
            </span>
            <span className="text-xs text-muted-foreground">{totalProducts} toplam</span>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Ürün, tip, kurye veya seri no ara..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 border-2"
              data-testid="search-products"
            />
          </div>
          {/* Filter checkboxes */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3 mt-2 text-xs">
            <div className="flex items-center gap-1.5">
              <Checkbox id="filterAssigned" checked={filterAssigned} onCheckedChange={setFilterAssigned} className="h-4 w-4" />
              <Label htmlFor="filterAssigned" className="text-xs sm:text-sm text-blue-600 cursor-pointer">Zimmetliler</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox id="filterAvailable" checked={filterAvailable} onCheckedChange={setFilterAvailable} className="h-4 w-4" />
              <Label htmlFor="filterAvailable" className="text-xs sm:text-sm text-green-600 cursor-pointer">Boştakiler</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox id="filterDefective" checked={filterDefective} onCheckedChange={setFilterDefective} className="h-4 w-4" />
              <Label htmlFor="filterDefective" className="text-xs sm:text-sm text-yellow-600 cursor-pointer">Arızalı</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox id="filterLost" checked={filterLost} onCheckedChange={setFilterLost} className="h-4 w-4" />
              <Label htmlFor="filterLost" className="text-xs sm:text-sm text-red-600 cursor-pointer">Kayıp</Label>
            </div>
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto">
          {/* Products List */}
          {filteredProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground p-8 text-center">
              {searchQuery ? "Arama sonucu bulunamadı" : "Henüz ürün yok"}
            </p>
          ) : (
            <>
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className={`p-3 border-b border-border cursor-pointer transition-colors ${
                    selectedProduct?.id === product.id ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-slate-50"
                  }`}
                  data-testid={`product-item-${product.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate">{product.name}</p>
                        {product.is_defective && (
                          <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded">Arızalı</span>
                        )}
                        {product.is_lost && (
                          <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded">Kayıp</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{product.product_type_name}</span>
                        {product.serial_number && <span className="font-mono">SN: {product.serial_number}</span>}
                        {product.pos_serial && <span className="font-mono">SN: {product.pos_serial}</span>}
                        {product.pos_terminal && <span className="font-mono">TRM: {product.pos_terminal}</span>}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {product.assigned_to_courier_id ? (
                        <div className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                          <User className="w-3 h-3" />
                          <span className="truncate max-w-[80px]">{product.assigned_to_courier_name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">Boşta</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {hasMoreProducts && !searchQuery && (
                <div className="text-center py-3">
                  <Button size="sm" variant="outline" onClick={loadMoreProducts} disabled={loadingMore} className="h-9 text-sm">
                    {loadingMore ? "Yükleniyor..." : `Daha Fazla Yükle (${totalProducts - products.length} kaldı)`}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right Panel - Details */}
      <div className="w-full lg:w-1/2 border-2 border-border bg-white flex flex-col" style={{ height: 'calc(100vh - 220px)' }}>
        {selectedProduct ? (
          <>
            {/* Product Header */}
            <div className="p-3 sm:p-4 border-b-2 border-border bg-slate-50 flex-shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg font-bold truncate">{selectedProduct.name}</h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">{selectedProduct.product_type_name}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {selectedProduct.is_defective && (
                      <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-yellow-100 text-yellow-700 rounded font-medium">Arızalı</span>
                    )}
                    {selectedProduct.is_lost && (
                      <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 bg-red-100 text-red-700 rounded font-medium">Kayıp</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => openEditProduct(selectedProduct)} className="h-8 sm:h-9 border-2 text-xs sm:text-sm">
                    <Pencil className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-1" /> 
                    <span className="hidden sm:inline">Düzenle</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedProduct(null)} className="h-8 sm:h-9">
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Product Info */}
            <div className="p-4 border-b-2 border-border flex-shrink-0">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {selectedProduct.serial_number && (
                  <div>
                    <span className="text-muted-foreground">Seri No:</span>
                    <span className="font-mono ml-2">{selectedProduct.serial_number}</span>
                  </div>
                )}
                {selectedProduct.pos_serial && (
                  <div>
                    <span className="text-muted-foreground">POS Seri No:</span>
                    <span className="font-mono ml-2">{selectedProduct.pos_serial}</span>
                  </div>
                )}
                {selectedProduct.pos_terminal && (
                  <div>
                    <span className="text-muted-foreground">POS Terminal:</span>
                    <span className="font-mono ml-2">{selectedProduct.pos_terminal}</span>
                  </div>
                )}
              </div>
              
              {/* Assignment Status */}
              <div className="pt-3 mt-3 border-t border-slate-200">
                {selectedProduct.assigned_to_courier_id ? (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-blue-600">
                      <User className="w-4 h-4" />
                      <span className="font-semibold">{selectedProduct.assigned_to_courier_name}</span>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {selectedProduct.assigned_at && formatDate(selectedProduct.assigned_at)}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-green-600 font-semibold">Boşta - Zimmetli değil</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="p-3 sm:p-4 border-b-2 border-border flex-shrink-0">
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                {selectedProduct.assigned_to_courier_id ? (
                  <Button size="sm" variant="outline" onClick={() => setShowReturnModal(true)} className="h-9 sm:h-10 border-2 text-xs sm:text-sm">
                    <ArrowLeftRight className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Geri Al
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setShowAssignModal(true)} disabled={selectedProduct.is_lost} className="h-9 sm:h-10 text-xs sm:text-sm">
                    <User className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Zimmetle
                  </Button>
                )}
                <Button 
                  size="sm" 
                  variant={selectedProduct.is_defective ? "default" : "outline"}
                  onClick={() => handleToggleDefective(selectedProduct)}
                  className={`h-9 sm:h-10 border-2 text-xs sm:text-sm ${selectedProduct.is_defective ? "bg-yellow-500 hover:bg-yellow-600" : ""}`}
                >
                  <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> 
                  {selectedProduct.is_defective ? "Arıza Kaldır" : "Arızalı"}
                </Button>
                <Button 
                  size="sm" 
                  variant={selectedProduct.is_lost ? "default" : "outline"}
                  onClick={() => handleToggleLost(selectedProduct)}
                  className={`h-9 sm:h-10 border-2 text-xs sm:text-sm ${selectedProduct.is_lost ? "bg-red-500 hover:bg-red-600" : ""}`}
                >
                  <XCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> 
                  {selectedProduct.is_lost ? "Kayıp Kaldır" : "Kayıp"}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleDeleteProduct(selectedProduct.id)}
                  className="h-9 sm:h-10 border-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-xs sm:text-sm"
                >
                  <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Sil
                </Button>
              </div>
            </div>

            {/* History */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-3 border-b border-border bg-slate-50 flex-shrink-0">
                <span className="text-sm font-semibold flex items-center gap-2">
                  <History className="w-4 h-4" /> Ürün Geçmişi ({productHistory.length})
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {productHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-8 text-center">Henüz işlem yok</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {productHistory.map((log) => (
                      <div key={log.id} className="p-3 hover:bg-slate-50">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getActionColor(log.action, log.details)}`}>
                              {getActionLabel(log.action, log.details)}
                            </span>
                            {log.courier_name && (
                              <span className="text-sm text-blue-600 flex items-center gap-1">
                                <User className="w-3 h-3" /> {log.courier_name}
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              {new Date(log.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-xs text-slate-500">{log.admin_name}</p>
                          </div>
                        </div>
                        {log.details?.notes && (
                          <p className="text-xs text-slate-500 mt-1 italic">&quot;{log.details.notes}&quot;</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Ürün seçin</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
