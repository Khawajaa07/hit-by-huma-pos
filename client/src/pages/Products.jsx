import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  QrCodeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  XMarkIcon,
  PhotoIcon,
  DocumentDuplicateIcon,
  TagIcon,
  PrinterIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';

export default function Products() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [expandedProducts, setExpandedProducts] = useState(new Set());

  // Check if user is salesman (view-only mode)
  const isSalesman = user?.role?.toLowerCase() === 'salesman' || user?.isSalesman;

  // Fetch products
  const { data: productsData, isLoading, refetch } = useQuery({
    queryKey: ['products', searchQuery, selectedCategory],
    queryFn: () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (selectedCategory) params.append('categoryId', selectedCategory);
      params.append('include_variants', 'true');
      return api.get(`/products?${params}`).then(res => res.data);
    }
  });

  // Extract products array from response
  const products = productsData?.products || productsData || [];

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories/list').then(res => res.data)
  });

  // Extract categories and transform to consistent format (support both SQL Server and PostgreSQL formats)
  const rawCategories = Array.isArray(categoriesData) ? categoriesData : (categoriesData?.categories || []);
  const categories = rawCategories.map(cat => ({
    id: cat.CategoryID || cat.category_id,
    name: cat.CategoryName || cat.category_name
  }));

  // Delete product mutation
  const deleteMutation = useMutation({
    mutationFn: (productId) => api.delete(`/products/${productId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted successfully');
    },
    onError: () => toast.error('Failed to delete product')
  });

  const toggleExpand = (productId) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId);
    } else {
      newExpanded.add(productId);
    }
    setExpandedProducts(newExpanded);
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setShowProductModal(true);
  };

  const handleDelete = (product) => {
    if (confirm(`Delete "${product.name}"? This action cannot be undone.`)) {
      deleteMutation.mutate(product.id);
    }
  };

  const handlePrintLabel = (product) => {
    const barcode = product.barcode || product.code;
    if (!barcode) {
      toast.error('Product has no barcode. Edit product to generate one.');
      return;
    }

    // Ask for quantity and printer type
    const quantity = prompt('How many labels to print?', '1');
    if (!quantity) return;

    const useLabelPrinter = confirm('Use label printer?\n\nClick OK for Label Printer (small labels)\nClick Cancel for Regular Printer (A4 sheet)');

    printProductLabels({
      name: product.name,
      barcode: barcode,
      price: product.basePrice || product.price
    }, parseInt(quantity) || 1, useLabelPrinter);
  };

  const printProductLabels = (productData, quantity, useLabelPrinter) => {
    const labelHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Product Labels - ${productData.name}</title>
        <style>
          @page {
            size: ${useLabelPrinter ? '50mm 30mm' : 'A4'};
            margin: ${useLabelPrinter ? '2mm' : '10mm'};
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
          }
          .label-container {
            display: ${useLabelPrinter ? 'block' : 'flex'};
            flex-wrap: wrap;
            gap: 10px;
            padding: ${useLabelPrinter ? '0' : '10px'};
          }
          .label {
            width: ${useLabelPrinter ? '46mm' : '60mm'};
            height: ${useLabelPrinter ? '26mm' : '35mm'};
            border: ${useLabelPrinter ? 'none' : '1px dashed #ccc'};
            padding: 3mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            page-break-after: ${useLabelPrinter ? 'always' : 'avoid'};
            break-inside: avoid;
          }
          .product-name {
            font-size: ${useLabelPrinter ? '8pt' : '10pt'};
            font-weight: bold;
            text-align: center;
            margin-bottom: 2mm;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .barcode {
            font-family: 'Libre Barcode 39', 'Free 3 of 9', monospace;
            font-size: ${useLabelPrinter ? '24pt' : '32pt'};
            letter-spacing: 2px;
          }
          .barcode-text {
            font-size: ${useLabelPrinter ? '7pt' : '9pt'};
            margin-top: 1mm;
          }
          .price {
            font-size: ${useLabelPrinter ? '10pt' : '12pt'};
            font-weight: bold;
            margin-top: 1mm;
          }
        </style>
        <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
      </head>
      <body>
        <div class="label-container">
          ${Array(quantity).fill(`
            <div class="label">
              <div class="product-name">${productData.name}</div>
              <div class="barcode">*${productData.barcode}*</div>
              <div class="barcode-text">${productData.barcode}</div>
              <div class="price">Rs. ${parseFloat(productData.price || 0).toFixed(2)}</div>
            </div>
          `).join('')}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 500);
          }
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=400,height=300');
    if (printWindow) {
      printWindow.document.write(labelHTML);
      printWindow.document.close();
    } else {
      toast.error('Please allow popups to print labels');
    }
  };

  const handleCloseModal = () => {
    setShowProductModal(false);
    setEditingProduct(null);
  };

  return (
    <div className="p-6">
      {/* View Only Banner for Salesmen */}
      {isSalesman && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
          <EyeIcon className="w-5 h-5 text-yellow-600" />
          <span className="text-yellow-800 text-sm font-medium">View Only Mode - You can view products but cannot add, edit, or delete them.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500">{isSalesman ? 'View product catalog and details' : 'Manage your product catalog and variants'}</p>
        </div>
        {!isSalesman && (
          <button
            onClick={() => setShowProductModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <PlusIcon className="w-5 h-5" />
            Add Product
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 mb-6 flex gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products by name, SKU, or barcode..."
            className="w-full pl-10 pr-4 py-2 border rounded-lg"
          />
        </div>

        {/* Category Filter */}
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="appearance-none pl-10 pr-10 py-2 border rounded-lg bg-white"
          >
            <option value="">All Categories</option>
            {categories?.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <FunnelIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Product
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SKU
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stock
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gray-200 rounded-lg" />
                      <div className="h-4 bg-gray-200 rounded w-32" />
                    </div>
                  </td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-24" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-12" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                  <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-20 ml-auto" /></td>
                </tr>
              ))
            ) : products?.length > 0 ? (
              products.map((product) => (
                <>
                  {/* Parent Product Row */}
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {product.variants?.length > 0 && (
                          <button
                            onClick={() => toggleExpand(product.id)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            {expandedProducts.has(product.id) ? (
                              <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronRightIcon className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                        )}
                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <QrCodeIcon className="w-6 h-6 text-gray-300" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{product.name}</p>
                          {product.variants?.length > 0 && (
                            <p className="text-sm text-gray-500">
                              {product.variants.length} variants
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{product.code}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
                        {product.category?.name || 'Uncategorized'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium">${parseFloat(product.basePrice || 0).toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={`font-medium ${product.totalStock > 10 ? 'text-green-600' :
                          product.totalStock > 0 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                        {product.totalStock || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${product.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                        }`}>
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handlePrintLabel(product)}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-lg"
                          title="Print Labels"
                        >
                          <PrinterIcon className="w-4 h-4" />
                        </button>
                        {!isSalesman && (
                          <>
                            <button
                              onClick={() => handleEdit(product)}
                              className="p-2 text-gray-400 hover:text-primary-600 hover:bg-gray-100 rounded-lg"
                              title="Edit"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(product)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-gray-100 rounded-lg"
                              title="Delete"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Variant Rows */}
                  {expandedProducts.has(product.id) && product.variants?.map((variant) => (
                    <tr key={variant.id} className="bg-gray-50/50">
                      <td className="px-6 py-3 pl-16">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            <TagIcon className="w-5 h-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-700">
                              {variant.name}
                            </p>
                            <div className="flex gap-2 mt-1">
                              {variant.attributes?.map((attr, i) => (
                                <span key={i} className="text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded">
                                  {attr.name}: {attr.value}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">{variant.sku}</td>
                      <td className="px-6 py-3"></td>
                      <td className="px-6 py-3 font-medium text-sm">
                        ${parseFloat(variant.price || product.basePrice || 0).toFixed(2)}
                      </td>
                      <td className="px-6 py-3">
                        <span className={`text-sm font-medium ${variant.stock > 10 ? 'text-green-600' :
                            variant.stock > 0 ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                          {variant.stock || 0}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${variant.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                          }`}>
                          {variant.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button className="p-1.5 text-gray-400 hover:text-primary-600 rounded">
                            <PencilIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  <QrCodeIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">No products found</p>
                  <p className="text-sm">Add your first product to get started</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Product Modal */}
      {showProductModal && (
        <ProductModal
          product={editingProduct}
          categories={categories}
          onClose={handleCloseModal}
          onSave={() => {
            refetch();
            handleCloseModal();
          }}
        />
      )}
    </div>
  );
}

// Product Modal Component
function ProductModal({ product, categories, onClose, onSave }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: product?.name || '',
    sku: product?.code || '',
    barcode: product?.barcode || '',
    category_id: product?.category?.id || product?.categoryId || '',
    description: product?.description || '',
    price: product?.basePrice || '',
    cost_price: product?.costPrice || '',
    initial_stock: product?.totalStock ?? product?.stock ?? 0,
    is_active: product?.isActive ?? true,
    has_variants: product?.hasVariants ?? false
  });
  const [variants, setVariants] = useState(product?.variants || []);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [createdProduct, setCreatedProduct] = useState(null);
  const [labelQuantity, setLabelQuantity] = useState(1);

  // Auto-generate barcode when SKU changes (for new products only)
  useEffect(() => {
    if (!product && formData.sku && !formData.barcode) {
      // Generate barcode from SKU - use numeric format for standard barcode scanners
      const barcodeValue = generateBarcodeFromSKU(formData.sku);
      setFormData(prev => ({ ...prev, barcode: barcodeValue }));
    }
  }, [formData.sku, product]);

  const generateBarcodeFromSKU = (sku) => {
    // Generate a numeric barcode: timestamp + hash of SKU
    // This creates a unique 13-digit EAN-like barcode
    const timestamp = Date.now().toString().slice(-7);
    let hash = 0;
    for (let i = 0; i < sku.length; i++) {
      hash = ((hash << 5) - hash) + sku.charCodeAt(i);
      hash = hash & hash;
    }
    const hashStr = Math.abs(hash).toString().padStart(6, '0').slice(0, 6);
    return timestamp + hashStr;
  };

  const printLabels = async (productData, quantity = 1, useLabelPrinter = true) => {
    const barcode = productData.barcode || productData.sku;
    const name = productData.name;
    const price = productData.price;

    // Create label HTML
    const labelHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Product Labels</title>
        <style>
          @page {
            size: ${useLabelPrinter ? '50mm 30mm' : 'A4'};
            margin: ${useLabelPrinter ? '2mm' : '10mm'};
          }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
          }
          .label-container {
            display: ${useLabelPrinter ? 'block' : 'flex'};
            flex-wrap: wrap;
            gap: 10px;
            padding: ${useLabelPrinter ? '0' : '10px'};
          }
          .label {
            width: ${useLabelPrinter ? '46mm' : '60mm'};
            height: ${useLabelPrinter ? '26mm' : '35mm'};
            border: ${useLabelPrinter ? 'none' : '1px dashed #ccc'};
            padding: 3mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            page-break-after: ${useLabelPrinter ? 'always' : 'avoid'};
            break-inside: avoid;
          }
          .product-name {
            font-size: ${useLabelPrinter ? '8pt' : '10pt'};
            font-weight: bold;
            text-align: center;
            margin-bottom: 2mm;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .barcode {
            font-family: 'Libre Barcode 39', 'Free 3 of 9', monospace;
            font-size: ${useLabelPrinter ? '24pt' : '32pt'};
            letter-spacing: 2px;
          }
          .barcode-text {
            font-size: ${useLabelPrinter ? '7pt' : '9pt'};
            margin-top: 1mm;
          }
          .price {
            font-size: ${useLabelPrinter ? '10pt' : '12pt'};
            font-weight: bold;
            margin-top: 1mm;
          }
          @media print {
            .no-print { display: none; }
          }
        </style>
        <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
      </head>
      <body>
        <div class="label-container">
          ${Array(quantity).fill(`
            <div class="label">
              <div class="product-name">${name}</div>
              <div class="barcode">*${barcode}*</div>
              <div class="barcode-text">${barcode}</div>
              <div class="price">Rs. ${parseFloat(price).toFixed(2)}</div>
            </div>
          `).join('')}
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              window.close();
            }, 500);
          }
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=400,height=300');
    if (printWindow) {
      printWindow.document.write(labelHTML);
      printWindow.document.close();
    } else {
      toast.error('Please allow popups to print labels');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Map client field names to server expected field names
      const payload = {
        name: formData.name,
        code: formData.sku || `PRD-${Date.now()}`, // Server expects 'code', use SKU or generate one
        description: formData.description,
        basePrice: parseFloat(formData.price) || 0,
        costPrice: parseFloat(formData.cost_price) || 0,
        stock: parseInt(formData.initial_stock) || 0,
        hasVariants: formData.has_variants,
        isActive: formData.is_active,
        barcode: formData.barcode,
        variants: formData.has_variants ? variants.map(v => ({
          sku: v.sku,
          variantName: v.variant_name,
          price: parseFloat(v.price) || 0,
          attributes: v.attributes
        })) : []
      };

      // Only include categoryId if it has a valid value (not null/empty)
      if (formData.category_id) {
        payload.categoryId = parseInt(formData.category_id);
      }

      let savedProduct;
      if (product) {
        await api.put(`/products/${product.id}`, payload);
        toast.success('Product updated successfully');
        savedProduct = { ...payload, id: product.id };
      } else {
        // For new products, use initialStock
        payload.initialStock = payload.stock;
        delete payload.stock;
        const response = await api.post('/products', payload);
        toast.success('Product created successfully');
        savedProduct = { ...payload, id: response.data?.productId };

        // Show label printing modal for new products
        setCreatedProduct({
          name: formData.name,
          barcode: formData.barcode || formData.sku,
          price: formData.price
        });
        setShowLabelModal(true);
        setLoading(false);
        return; // Don't close yet, wait for label decision
      }

      // Force refresh the products list
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      onSave();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  const handleLabelPrint = async (useLabelPrinter) => {
    if (createdProduct) {
      await printLabels(createdProduct, labelQuantity, useLabelPrinter);
    }
    setShowLabelModal(false);
    await queryClient.invalidateQueries({ queryKey: ['products'] });
    onSave();
  };

  const handleSkipLabels = async () => {
    setShowLabelModal(false);
    await queryClient.invalidateQueries({ queryKey: ['products'] });
    onSave();
  };

  const generateSKU = () => {
    const prefix = formData.category_id ?
      categories?.find(c => c.id === parseInt(formData.category_id))?.name?.substring(0, 3).toUpperCase() : 'PRD';
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newSku = `${prefix}-${random}`;
    setFormData({ ...formData, sku: newSku, barcode: generateBarcodeFromSKU(newSku) });
  };

  const regenerateBarcode = () => {
    if (formData.sku) {
      const newBarcode = generateBarcodeFromSKU(formData.sku);
      setFormData({ ...formData, barcode: newBarcode });
      toast.success('Barcode regenerated');
    } else {
      toast.error('Enter SKU first to generate barcode');
    }
  };

  const addVariant = () => {
    setVariants([
      ...variants,
      {
        id: Date.now(),
        variant_name: '',
        sku: '',
        price: formData.price,
        attributes: [{ name: 'Size', value: '' }, { name: 'Color', value: '' }]
      }
    ]);
  };

  const updateVariant = (id, field, value) => {
    setVariants(variants.map(v =>
      v.id === id ? { ...v, [field]: value } : v
    ));
  };

  const updateVariantAttribute = (variantId, attrIndex, field, value) => {
    setVariants(variants.map(v => {
      if (v.id === variantId) {
        const newAttributes = [...v.attributes];
        newAttributes[attrIndex] = { ...newAttributes[attrIndex], [field]: value };
        return { ...v, attributes: newAttributes };
      }
      return v;
    }));
  };

  const removeVariant = (id) => {
    setVariants(variants.filter(v => v.id !== id));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">
            {product ? 'Edit Product' : 'Add New Product'}
          </h2>
          <button onClick={onClose}>
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          <button
            onClick={() => setActiveTab('basic')}
            className={`px-4 py-3 font-medium border-b-2 -mb-px ${activeTab === 'basic'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500'
              }`}
          >
            Basic Info
          </button>
          <button
            onClick={() => setActiveTab('variants')}
            className={`px-4 py-3 font-medium border-b-2 -mb-px ${activeTab === 'variants'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500'
              }`}
          >
            Variants
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {activeTab === 'basic' ? (
            <div className="space-y-4">
              {/* Product Name */}
              <div>
                <label className="label">Product Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter product name"
                  className="input"
                  required
                />
              </div>

              {/* SKU & Barcode */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">SKU *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                      placeholder="Product SKU"
                      className="input flex-1"
                      required
                    />
                    <button
                      type="button"
                      onClick={generateSKU}
                      className="btn btn-secondary"
                      title="Generate SKU"
                    >
                      <DocumentDuplicateIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">Barcode (Auto-generated)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.barcode}
                      onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                      placeholder="Auto-generated from SKU"
                      className="input flex-1"
                    />
                    <button
                      type="button"
                      onClick={regenerateBarcode}
                      className="btn btn-secondary"
                      title="Regenerate Barcode"
                    >
                      <QrCodeIcon className="w-5 h-5" />
                    </button>
                  </div>
                  {formData.barcode && (
                    <p className="text-xs text-gray-500 mt-1">
                      Barcode: {formData.barcode}
                    </p>
                  )}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="label">Category</label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="input"
                >
                  <option value="">Select Category</option>
                  {categories?.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="label">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Product description"
                  rows={3}
                  className="input resize-none"
                />
              </div>

              {/* Prices */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Selling Price *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className="input pl-8"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Cost Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      value={formData.cost_price}
                      onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className="input pl-8"
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Stock</label>
                  <input
                    type="number"
                    value={formData.initial_stock}
                    onChange={(e) => setFormData({ ...formData, initial_stock: e.target.value })}
                    placeholder="0"
                    min="0"
                    className="input"
                  />
                </div>
              </div>

              {/* Has Variants Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">Product has variants</p>
                  <p className="text-sm text-gray-500">Enable for products with size, color options</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, has_variants: !formData.has_variants })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${formData.has_variants ? 'bg-primary-600' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.has_variants ? 'left-7' : 'left-1'
                      }`}
                  />
                </button>
              </div>

              {/* Active Status */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium">Active</p>
                  <p className="text-sm text-gray-500">Product is available for sale</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                  className={`relative w-12 h-6 rounded-full transition-colors ${formData.is_active ? 'bg-primary-600' : 'bg-gray-300'
                    }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.is_active ? 'left-7' : 'left-1'
                      }`}
                  />
                </button>
              </div>
            </div>
          ) : (
            /* Variants Tab */
            <div className="space-y-4">
              {!formData.has_variants ? (
                <div className="text-center py-8 text-gray-500">
                  <TagIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>Enable variants in the Basic Info tab first</p>
                </div>
              ) : (
                <>
                  {variants.length > 0 && (
                    <div className="space-y-4">
                      {variants.map((variant, index) => (
                        <div key={variant.id} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-medium text-gray-700">Variant {index + 1}</span>
                            <button
                              type="button"
                              onClick={() => removeVariant(variant.id)}
                              className="text-red-500 hover:text-red-700"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className="label text-sm">Variant Name</label>
                              <input
                                type="text"
                                value={variant.variant_name}
                                onChange={(e) => updateVariant(variant.id, 'variant_name', e.target.value)}
                                placeholder="e.g., Large / Red"
                                className="input input-sm"
                              />
                            </div>
                            <div>
                              <label className="label text-sm">SKU</label>
                              <input
                                type="text"
                                value={variant.sku}
                                onChange={(e) => updateVariant(variant.id, 'sku', e.target.value.toUpperCase())}
                                placeholder="Variant SKU"
                                className="input input-sm"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div>
                              <label className="label text-sm">Price</label>
                              <input
                                type="number"
                                value={variant.price}
                                onChange={(e) => updateVariant(variant.id, 'price', e.target.value)}
                                placeholder="0.00"
                                step="0.01"
                                className="input input-sm"
                              />
                            </div>
                            {variant.attributes.map((attr, attrIndex) => (
                              <div key={attrIndex}>
                                <label className="label text-sm">{attr.name}</label>
                                <input
                                  type="text"
                                  value={attr.value}
                                  onChange={(e) => updateVariantAttribute(variant.id, attrIndex, 'value', e.target.value)}
                                  placeholder={`Enter ${attr.name}`}
                                  className="input input-sm"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={addVariant}
                    className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-500 hover:text-primary-600 flex items-center justify-center gap-2"
                  >
                    <PlusIcon className="w-5 h-5" />
                    Add Variant
                  </button>
                </>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Saving...' : (product ? 'Update Product' : 'Create Product')}
          </button>
        </div>

        {/* Label Printing Modal */}
        {showLabelModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-2xl w-full max-w-md p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <PrinterIcon className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Product Created!</h3>
                <p className="text-gray-500 mt-2">Would you like to print labels for this product?</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="text-center">
                  <p className="font-medium text-gray-900">{createdProduct?.name}</p>
                  <p className="text-2xl font-mono mt-2 tracking-wider">{createdProduct?.barcode}</p>
                  <p className="text-lg font-semibold text-primary-600 mt-1">
                    Rs. {parseFloat(createdProduct?.price || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <label className="label">Number of Labels</label>
                <input
                  type="number"
                  value={labelQuantity}
                  onChange={(e) => setLabelQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                  max="100"
                  className="input text-center text-lg"
                />
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => handleLabelPrint(true)}
                  className="w-full btn-primary flex items-center justify-center gap-2"
                >
                  <PrinterIcon className="w-5 h-5" />
                  Print with Label Printer
                </button>
                <button
                  onClick={() => handleLabelPrint(false)}
                  className="w-full btn btn-secondary flex items-center justify-center gap-2"
                >
                  <PrinterIcon className="w-5 h-5" />
                  Print on Regular Printer (A4)
                </button>
                <button
                  onClick={handleSkipLabels}
                  className="w-full text-gray-500 hover:text-gray-700 py-2"
                >
                  Skip - Don't Print Labels
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
