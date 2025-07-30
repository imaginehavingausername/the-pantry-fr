"use client"
import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Upload, X } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Checkbox } from "~/components/ui/checkbox"
import { Label } from "~/components/ui/label"
import { Separator } from "~/components/ui/separator"
import { toast } from "sonner"
import { useUploadThing } from "~/lib/uploadthing"

// Form data interface matching your API
interface FormData {
  name: string;
  quantity: number;
  expirationDate: string;
  placement: string;
  keywords: string[];
  categoryNames: string[];
  imageUrl?: string;
}

export default function AddFood() {
  const router = useRouter()

  // Form state
  const [formData, setFormData] = useState<FormData>({
    name: '',
    quantity: 1,
    expirationDate: '',
    placement: '',
    keywords: [],
    categoryNames: [],
    imageUrl: ''
  })
  
  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  
  // Image upload state
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  
  const categories = ["Breakfast", "Lunch", "Dinner", "Snack", "Dessert", "Main", "Veggie", "Starch"]

  // UploadThing hook
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

  const handleGoBack = () => {
    router.back()
  }

  // Handle input changes
  const handleInputChange = (field: keyof FormData, value: string | number) => {
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

  // Handle keywords input (comma-separated)
  const handleKeywordsChange = (value: string) => {
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
      
      // Validate file size (e.g., max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast("Image size should be less than 5MB")
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
    if (formData.quantity <= 0) return "Quantity must be greater than 0"
    if (!formData.placement.trim()) return "Placement is required"
    
    // Validate date format and ensure it's not in the past
    const expDate = new Date(formData.expirationDate)
    if (isNaN(expDate.getTime())) return "Please enter a valid expiration date"
    
    return null
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate form
    const validationError = validateForm()
    if (validationError) {
      toast("Validation Error")
      return
    }

    // Upload image first if there's a selected image
    if (selectedImage && !formData.imageUrl) {
      await handleImageUpload()
      // Wait a bit for the upload to complete
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    setIsSubmitting(true)

    try {
      const response = await fetch('/api/fooditem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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

      const newItem = await response.json()
      
      toast("new item has been added to your pantry.")

      // Navigate back to home page
      router.push("/")
      
    } catch (error) {
      console.error('Error creating food item:', error)
      toast(error instanceof Error ? error.message : "Failed to create food item. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Format date for input (YYYY-MM-DD)
  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0]
  }

  // Set default expiration date to tomorrow
  const getDefaultExpirationDate = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return formatDateForInput(tomorrow)
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-6">
        <Button
          variant="outline"
          className="border-[#528F04] text-[#528F04] mb-4 bg-transparent"
          onClick={handleGoBack}
          disabled={isSubmitting}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go back
        </Button>
        
        <Separator className="my-4" />
        
        <h1 className="text-3xl font-bold mb-6">Add Food</h1>
        
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input 
              id="name" 
              placeholder="Enter food name" 
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
            <div className="mt-1 space-y-4">
              {/* Image Preview */}
              {imagePreview && (
                <div className="relative inline-block">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="w-32 h-32 object-cover rounded-md border"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 text-white hover:bg-red-600"
                    onClick={handleRemoveImage}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              
              {/* Upload Area */}
              <div className="border-2 border-dashed border-gray-300 rounded-md p-6">
                <div className="text-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    id="image-upload"
                    disabled={isUploading || isSubmitting}
                  />
                  <div className="flex flex-col items-center space-y-2">
                    <Label htmlFor="image-upload" className="cursor-pointer">
                      <Button 
                        type="button"
                        variant="outline" 
                        className="text-sm bg-transparent"
                        disabled={isUploading || isSubmitting}
                        asChild
                      >
                        <span>
                          <Upload className="h-4 w-4 mr-2" />
                          {selectedImage ? 'Change Image' : 'Upload Image'}
                        </span>
                      </Button>
                    </Label>
                    
                    {selectedImage && !formData.imageUrl && (
                      <Button
                        type="button"
                        onClick={handleImageUpload}
                        disabled={isUploading}
                        className="text-sm bg-[#528F04] hover:bg-[#3e6b03]"
                      >
                        {isUploading ? 'Uploading...' : 'Upload Selected Image'}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    PNG, JPG up to 5MB
                  </p>
                </div>
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
              min={formatDateForInput(new Date())} // Prevent past dates
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
                    disabled={isSubmitting}
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
              onChange={(e) => handleKeywordsChange(e.target.value)}
              disabled={isSubmitting}
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
            disabled={isSubmitting || isUploading}
          >
            {isSubmitting ? 'CREATING...' : 'CREATE FOOD'}
          </Button>
        </form>
      </div>
    </div>
  )
}