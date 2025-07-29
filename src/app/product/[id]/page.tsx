"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Trash2, Upload } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Checkbox } from "~/components/ui/checkbox"
import { Label } from "~/components/ui/label"
import { Separator } from "~/components/ui/separator"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog"

// Type definitions matching your API
interface FoodItemData {
  id: string;
  name: string;
  quantity: number;
  placement: string;
  expirationDate: string;
  imageUrl?: string;
  keywords: string[];
  hidden: boolean;
  categories: {
    foodCategory: {
      name: string;
    };
  }[];
}

interface UpdateFormData {
  name: string;
  quantity: number;
  expirationDate: any;
  placement: string;
  keywords: string[];
  categoryNames: string[];
  imageUrl?: string;
}

export default function ProductDetail() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  
  // State management
  const [foodItem, setFoodItem] = useState<FoodItemData | null>(null)
  const [formData, setFormData] = useState<UpdateFormData>({
    name: '',
    quantity: 1,
    expirationDate: '',
    placement: '',
    keywords: [],
    categoryNames: [],
    imageUrl: ''
  })
  
  // UI state
  const [loading, setLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [keywordsInput, setKeywordsInput] = useState('')
  
  const categories = ["Breakfast", "Lunch", "Dinner", "Snack", "Dessert", "Main", "Veggie", "Starch"]

  // Fetch food item data
  const fetchFoodItem = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/fooditem?id=${id}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Food item not found')
        }
        throw new Error(`Failed to fetch food item: ${response.status}`)
      }
      
      const data: FoodItemData = await response.json()
      setFoodItem(data)
      
      // Populate form with existing data
      const categoryNames = data.categories.map(cat => cat.foodCategory.name)
      setFormData({
        name: data.name,
        quantity: data.quantity,
        expirationDate: data.expirationDate.split('T')[0], // Format for date inputstring
        placement: data.placement,
        keywords: data.keywords,
        categoryNames: categoryNames,
        imageUrl: data.imageUrl || ''
      })
      
      setSelectedCategories(categoryNames)
      setKeywordsInput(data.keywords.join(', '))
      
    } catch (error) {
      console.error('Error fetching food item:', error)
      toast("failed to load food item")
      // Redirect to home if item not found
      router.push("/")
    } finally {
      setLoading(false)
    }
  }

  // Load data on component mount
  useEffect(() => {
    if (id) {
      fetchFoodItem()
    }
  }, [id])

  const handleGoBack = () => {
    router.back()
  }

  // Handle input changes
  const handleInputChange = (field: keyof UpdateFormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Handle category selection
  const handleCategoryChange = (category: string, checked: boolean) => {
    setSelectedCategories(prev => {
      if (checked) {
        return [...prev, category]
      } else {
        return prev.filter(c => c !== category)
      }
    })
    
    setFormData(prev => ({
      ...prev,
      categoryNames: checked 
        ? [...prev.categoryNames, category]
        : prev.categoryNames.filter(c => c !== category)
    }))
  }

  // Handle keywords input
  const handleKeywordsChange = (value: string) => {
    setKeywordsInput(value)
    const keywordArray = value.split(',').map(k => k.trim()).filter(k => k.length > 0)
    setFormData(prev => ({
      ...prev,
      keywords: keywordArray
    }))
  }

  // Form validation
  const validateForm = (): string | null => {
    if (!formData.name.trim()) return "Name is required"
    if (!formData.expirationDate) return "Expiration date is required"
    if (formData.quantity <= 0) return "Quantity must be greater than 0"
    if (!formData.placement.trim()) return "Placement is required"
    
    const expDate = new Date(formData.expirationDate)
    if (isNaN(expDate.getTime())) return "Please enter a valid expiration date"
    
    return null
  }

  // Handle update
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const validationError = validateForm()
    if (validationError) {
      toast("validation error has occured")
      return
    }

    setIsUpdating(true)

    try {
      const response = await fetch('/api/fooditem', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: id,
          name: formData.name.trim(),
          quantity: formData.quantity,
          expirationDate: formData.expirationDate,
          placement: formData.placement.trim(),
          keywords: formData.keywords,
          categoryNames: formData.categoryNames,
          imageUrl: formData.imageUrl || undefined,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      const updatedItem = await response.json()
      setFoodItem(updatedItem)
      
      toast("item has been updated!!")

    } catch (error) {
      console.error('Error updating food item:', error)
      toast("failed to update item. please try again.")
    } finally {
      setIsUpdating(false)
      handleGoBack()
    }
  }

  // Handle delete
  const handleDelete = async () => {
    setIsDeleting(true)

    try {
      const response = await fetch('/api/fooditem', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: id }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      toast("item has been deleted.")

      setShowDeleteDialog(false)
      router.push("/")

    } catch (error) {
      console.error('Error deleting food item:', error)
      toast("failed to delete item. please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  // Format date for input
  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0]
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-500">Loading food item...</p>
      </div>
    )
  }

  if (!foodItem) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-red-500">Food item not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-6">
        <Button
          variant="outline"
          className="border-[#528F04] text-[#528F04] mb-4 bg-transparent"
          onClick={handleGoBack}
          disabled={isUpdating || isDeleting}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go back
        </Button>

        <Separator className="my-4" />

        <h1 className="text-3xl font-bold mb-6">Edit Food</h1>

        <form className="space-y-6" onSubmit={handleUpdate}>
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input 
              id="name" 
              placeholder="Enter name" 
              className="mt-1"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="quantity">Quantity *</Label>
            <Input 
              id="quantity" 
              type="number"
              min="1"
              placeholder="Enter quantity" 
              className="mt-1"
              value={formData.quantity}
              onChange={(e) => handleInputChange('quantity', parseInt(e.target.value) || 1)}
              required
            />
          </div>

          <div>
            <Label>Image (Optional)</Label>
            <div className="mt-1 border-2 border-dashed border-gray-300 rounded-md p-6 flex justify-center">
              <div className="text-center">
                <div className="mt-1 flex justify-center">
                  <Button 
                    type="button"
                    variant="outline" 
                    className="text-sm bg-transparent"
                    disabled={isUpdating || isDeleting}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Image
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-2">Image upload coming soon</p>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="expiration">Expiration Date *</Label>
            <Input 
              id="expiration" 
              type="date"
              className="mt-1"
              value={formData.expirationDate}
              onChange={(e) => handleInputChange('expirationDate', e.target.value)}
              required
            />
          </div>

          <div>
            <Label>Categories (Optional)</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {categories.map((category) => (
                <div key={category} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`category-${category}`}
                    checked={selectedCategories.includes(category)}
                    onCheckedChange={(checked) => handleCategoryChange(category, checked as boolean)}
                    disabled={isUpdating || isDeleting}
                  />
                  <Label htmlFor={`category-${category}`}>{category}</Label>
                </div>
              ))}
            </div>
            {selectedCategories.length > 0 && (
              <p className="text-sm text-gray-600 mt-2">
                Selected: {selectedCategories.join(', ')}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="placement">Placement *</Label>
            <Input 
              id="placement" 
              placeholder="e.g., Refrigerator, Pantry, Freezer" 
              className="mt-1"
              value={formData.placement}
              onChange={(e) => handleInputChange('placement', e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="keywords">Keywords (Optional)</Label>
            <Input 
              id="keywords" 
              placeholder="Enter keywords separated by commas (e.g., organic, gluten-free, spicy)" 
              className="mt-1"
              value={keywordsInput}
              onChange={(e) => handleKeywordsChange(e.target.value)}
              disabled={isUpdating || isDeleting}
            />
            {formData.keywords.length > 0 && (
              <p className="text-sm text-gray-600 mt-1">
                Keywords: {formData.keywords.join(', ')}
              </p>
            )}
          </div>

          <Button 
            type="submit"
            className="w-full bg-[#528F04] hover:bg-[#3e6b03]"
            disabled={isUpdating || isDeleting}
          >
            {isUpdating ? 'UPDATING...' : 'UPDATE PRODUCT'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full flex items-center justify-center text-red-500 hover:text-red-700"
            onClick={() => setShowDeleteDialog(true)}
            disabled={isUpdating || isDeleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isDeleting ? 'DELETING...' : 'DELETE PRODUCT'}
          </Button>
        </form>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete "{foodItem.name}" from your pantry.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDelete} 
                className="bg-red-500 hover:bg-red-600"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}