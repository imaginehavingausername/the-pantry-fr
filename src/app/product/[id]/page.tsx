"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Trash2, Upload, X } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Checkbox } from "~/components/ui/checkbox"
import { Label } from "~/components/ui/label"
import { Separator } from "~/components/ui/separator"
import { toast } from "sonner"
import { useUploadThing } from "~/lib/uploadthing" // Adjust path as needed
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
  
  // Image upload state
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  
  const categories = ["Breakfast", "Lunch", "Dinner", "Snack", "Dessert", "Main", "Veggie", "Starch"]

  // UploadThing hook - adjust endpoint name as per your setup
  const { startUpload } = useUploadThing("imageUploader", {
    onClientUploadComplete: (res) => {
      if (res && res[0]) {
        const uploadedUrl = res[0].url
        setFormData(prev => ({
          ...prev,
          imageUrl: uploadedUrl
        }))
        toast("Image uploaded successfully!")
      }
      setIsUploading(false)
    },
    onUploadError: (error: Error) => {
      console.error("Upload error:", error)
      toast("Failed to upload image. Please try again.")
      setIsUploading(false)
    },
  })

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
        expirationDate: data.expirationDate.split('T')[0], // Format for date input
        placement: data.placement,
        keywords: data.keywords,
        categoryNames: categoryNames,
        imageUrl: data.imageUrl || ''
      })
      
      setSelectedCategories(categoryNames)
      setKeywordsInput(data.keywords.join(', '))
      
      // Set image preview if exists
      if (data.imageUrl) {
        setImagePreview(data.imageUrl)
      }
      
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

  // Handle image selection
  const handleImageSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast("Please select a valid image file")
        return
      }
      
      // Validate file size (e.g., max 4MB)
      if (file.size > 5 * 1024 * 1024) {
        toast("Image size should be less than 4MB")
        return
      }
      
      setSelectedImage(file)
      
      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // Handle image upload
  const handleImageUpload = async () => {
    if (!selectedImage) return
    
    setIsUploading(true)
    try {
      await startUpload([selectedImage])
    } catch (error) {
      console.error("Upload error:", error)
      toast("Failed to upload image. Please try again.")
      setIsUploading(false)
    }
  }

  // Remove image
  const handleRemoveImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
    setFormData(prev => ({
      ...prev,
      imageUrl: ''
    }))
  }

  // Form validation
  const validateForm = (): string | null => {
    if (!formData.name.trim()) return "Name is required"
    if (!formData.expirationDate) return "Expiration date is required"
    if (formData.quantity < 0) return "Quantity must be greater than 0"
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

    // Upload image first if there's a selected image
    if (selectedImage && !formData.imageUrl) {
      await handleImageUpload()
      // Wait a bit for the upload to complete
      await new Promise(resolve => setTimeout(resolve, 1000))
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

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <p className="text-gray-500 text-sm sm:text-base">Loading food item...</p>
      </div>
    )
  }

  if (!foodItem) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <p className="text-red-500 text-sm sm:text-base">Food item not found</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 max-w-2xl">
        <Button
          variant="outline"
          className="border-[#528F04] text-[#528F04] mb-4 bg-transparent text-sm sm:text-base"
          onClick={handleGoBack}
          disabled={isUpdating || isDeleting}
        >
          <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
          Go back
        </Button>

        <Separator className="my-4" />

        <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Edit Food</h1>

        <form className="space-y-4 sm:space-y-6" onSubmit={handleUpdate}>
          <div>
            <Label htmlFor="name" className="text-sm sm:text-base">Name *</Label>
            <Input 
              id="name" 
              placeholder="Enter name" 
              className="mt-1 text-sm sm:text-base"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="quantity" className="text-sm sm:text-base">Quantity *</Label>
            <Input 
              id="quantity" 
              type="number"
              // min="1"
              placeholder="Enter quantity" 
              className="mt-1 text-sm sm:text-base"
              value={formData.quantity}
              onChange={(e) => handleInputChange('quantity', parseInt(e.target.value) || 0)}
              required
            />
          </div>

          <div>
            <Label className="text-sm sm:text-base">Image *</Label>
            <div className="mt-1 space-y-3 sm:space-y-4">
              {/* Image Preview */}
              {imagePreview && (
                <div className="relative inline-block">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-md border"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-red-500 text-white hover:bg-red-600"
                    onClick={handleRemoveImage}
                  >
                    <X className="h-2 w-2 sm:h-3 sm:w-3" />
                  </Button>
                </div>
              )}
              
              {/* Upload Area */}
              <div className="border-2 border-dashed border-gray-300 rounded-md p-4 sm:p-6">
                <div className="text-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    id="image-upload"
                    disabled={isUploading || isUpdating || isDeleting}
                  />
                  <div className="flex flex-col items-center space-y-2">
                    <Label htmlFor="image-upload" className="cursor-pointer">
                      <Button 
                        type="button"
                        variant="outline" 
                        className="text-xs sm:text-sm bg-transparent px-3 py-2"
                        disabled={isUploading || isUpdating || isDeleting}
                        asChild
                      >
                        <span>
                          <Upload className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                          {selectedImage ? 'Change Image' : 'Upload Image'}
                        </span>
                      </Button>
                    </Label>
                    
                    {selectedImage && !formData.imageUrl && (
                      <Button
                        type="button"
                        onClick={handleImageUpload}
                        disabled={isUploading}
                        className="text-xs sm:text-sm bg-[#528F04] hover:bg-[#3e6b03] px-3 py-2"
                      >
                        {isUploading ? 'Uploading...' : 'Upload Selected Image'}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    PNG, JPG up to 4MB
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="expiration" className="text-sm sm:text-base">Expiration Date *</Label>
            <Input 
              id="expiration" 
              type="date"
              className="mt-1 text-sm sm:text-base"
              value={formData.expirationDate}
              onChange={(e) => handleInputChange('expirationDate', e.target.value)}
              required
            />
          </div>

          <div>
            <Label className="text-sm sm:text-base">Categories *</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 mt-1">
              {categories.map((category) => (
                <div key={category} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`category-${category}`}
                    checked={selectedCategories.includes(category)}
                    onCheckedChange={(checked) => handleCategoryChange(category, checked as boolean)}
                    disabled={isUpdating || isDeleting}
                    className="h-4 w-4"
                  />
                  <Label 
                    htmlFor={`category-${category}`}
                    className="text-xs sm:text-sm leading-tight cursor-pointer"
                  >
                    {category}
                  </Label>
                </div>
              ))}
            </div>
            {selectedCategories.length > 0 && (
              <p className="text-xs sm:text-sm text-gray-600 mt-2">
                Selected: {selectedCategories.join(', ')}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="placement" className="text-sm sm:text-base">Placement *</Label>
            <Input 
              id="placement" 
              placeholder="e.g., Refrigerator, Pantry, Freezer" 
              className="mt-1 text-sm sm:text-base"
              value={formData.placement}
              onChange={(e) => handleInputChange('placement', e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="keywords" className="text-sm sm:text-base">Keywords *</Label>
            <Input 
              id="keywords" 
              placeholder="Enter keywords separated by commas (e.g., organic, gluten-free, spicy)" 
              className="mt-1 text-sm sm:text-base"
              value={keywordsInput}
              onChange={(e) => handleKeywordsChange(e.target.value)}
              disabled={isUpdating || isDeleting}
            />
            {formData.keywords.length > 0 && (
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Keywords: {formData.keywords.join(', ')}
              </p>
            )}
          </div>

          <div className="space-y-3 sm:space-y-4 pt-2 sm:pt-4">
            <Button 
              type="submit"
              className="w-full bg-[#528F04] hover:bg-[#3e6b03] text-sm sm:text-base py-2 sm:py-3"
              disabled={isUpdating || isDeleting || isUploading}
            >
              {isUpdating ? 'UPDATING...' : 'UPDATE PRODUCT'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full flex items-center justify-center text-red-500 hover:text-red-700 text-sm sm:text-base py-2 sm:py-3 hover:bg-red-50"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isUpdating || isDeleting}
            >
              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
              {isDeleting ? 'DELETING...' : 'DELETE PRODUCT'}
            </Button>
          </div>
        </form>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="mx-4 max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg sm:text-xl">Are you sure?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm sm:text-base">
                This action cannot be undone. This will permanently delete "{foodItem.name}" from your pantry.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
              <AlertDialogCancel 
                disabled={isDeleting}
                className="w-full sm:w-auto text-sm sm:text-base"
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDelete} 
                className="w-full sm:w-auto bg-red-500 hover:bg-red-600 text-sm sm:text-base"
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