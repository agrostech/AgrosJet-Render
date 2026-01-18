// Helper functions for Zimmet components

export const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('tr-TR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
});

export const getActionLabel = (action, details) => {
  if (action === 'product_updated' && details?.changes) {
    return details.changes;
  }
  
  const labels = {
    'assigned': 'Zimmetlendi',
    'returned': 'Geri Alındı',
    'product_created': 'Ürün Oluşturuldu',
    'product_updated': 'Güncellendi',
    'product_deleted': 'Ürün Silindi'
  };
  return labels[action] || action;
};

export const getActionColor = (action, details) => {
  if (action === 'assigned') return 'text-blue-600 bg-blue-100';
  if (action === 'returned') return 'text-orange-600 bg-orange-100';
  if (action === 'product_created') return 'text-green-600 bg-green-100';
  if (action === 'product_deleted') return 'text-red-600 bg-red-100';
  if (action === 'product_updated') {
    if (details?.changes?.includes('Arızalı')) return 'text-yellow-600 bg-yellow-100';
    if (details?.changes?.includes('Kayıp')) return 'text-red-600 bg-red-100';
    if (details?.changes?.includes('kaldırıldı')) return 'text-green-600 bg-green-100';
    return 'text-purple-600 bg-purple-100';
  }
  return 'text-slate-600 bg-slate-100';
};
