import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { ImageIcon } from "lucide-react";
import { PageLoading } from "@/components/ui/loading-spinner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function MarketTab({ courierId, onAddToCart, cart }) {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");

  const fetchData = useCallback(async () => {
    try {
      const [catRes, prodRes] = await Promise.all([
        axios.get(`${API}/jetpuan/categories`),
        axios.get(`${API}/jetpuan/products`)
      ]);
      setCategories(catRes.data);
      setProducts(prodRes.data);
    } catch (err) {
      if (!err.handled) {
        console.error("Ürünler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredProducts = selectedCategory === "all"
    ? products
    : products.filter(p => p.category_id === selectedCategory);

  const getCartQuantity = (productId) => {
    const item = cart.find(i => i.product_id === productId);
    return item ? item.quantity : 0;
  };

  if (loading) return <PageLoading />;

  return (
    <div className="space-y-4">
      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Button
          variant={selectedCategory === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedCategory("all")}
          className="flex-shrink-0"
        >
          Tümü
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat.id}
            variant={selectedCategory === cat.id ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(cat.id)}
            className="flex-shrink-0"
          >
            {cat.name}
          </Button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Bu kategoride ürün bulunmuyor
          </div>
        ) : (
          filteredProducts.map((product) => {
            const cartQty = getCartQuantity(product.id);
            const isOutOfStock = product.stock <= 0;
            const isMaxInCart = cartQty >= product.stock;

            return (
              <ProductCard
                key={product.id}
                product={product}
                cartQty={cartQty}
                isOutOfStock={isOutOfStock}
                isMaxInCart={isMaxInCart}
                onAddToCart={onAddToCart}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function ProductCard({ product, cartQty, isOutOfStock, isMaxInCart, onAddToCart }) {
  return (
    <div className={`border-2 bg-white overflow-hidden ${isOutOfStock ? 'opacity-60' : 'border-border'}`}>
      <div className="aspect-square bg-slate-100 flex items-center justify-center relative">
        {product.image_url ? (
          <img 
            src={product.image_url} 
            alt={product.name}
            className="w-full h-full object-cover"
            style={{ maxWidth: '500px', maxHeight: '500px' }}
          />
        ) : (
          <ImageIcon className="w-12 h-12 text-muted-foreground opacity-50" />
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="bg-red-600 text-white px-3 py-1 text-sm font-semibold rounded">
              Tükendi
            </span>
          </div>
        )}
        {cartQty > 0 && (
          <div className="absolute top-2 right-2 bg-amber-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
            {cartQty}
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs text-amber-600 font-medium">{product.category_name}</p>
        <h4 className="font-semibold text-sm truncate">{product.name}</h4>
        <div className="flex items-center justify-between mt-2">
          <span className="text-lg font-bold text-primary">{product.price} JP</span>
          <span className="text-xs text-muted-foreground">Stok: {product.stock}</span>
        </div>
        <Button
          onClick={() => onAddToCart(product)}
          disabled={isOutOfStock || isMaxInCart}
          className="w-full mt-2 h-9 font-semibold bg-amber-600 hover:bg-amber-700"
          size="sm"
          data-testid={`add-to-cart-${product.id}`}
        >
          {isOutOfStock ? "Tükendi" : isMaxInCart ? "Maksimum" : "Sepete Ekle"}
        </Button>
      </div>
    </div>
  );
}
