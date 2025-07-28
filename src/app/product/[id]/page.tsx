"use client"

import { useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Trash2 } from "lucide-react"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Checkbox } from "~/components/ui/checkbox"
import { Label } from "~/components/ui/label"
import { Separator } from "~/components/ui/separator"
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

export default function ProductDetail() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const handleGoBack = () => {
    router.back()
  }

  const handleDelete = () => {
    // Handle delete logic here
    setShowDeleteDialog(false)
    router.push("/")
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-6">
        <Button
          variant="outline"
          className="border-[#528F04] text-[#528F04] mb-4 bg-transparent"
          onClick={handleGoBack}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go back
        </Button>

        <Separator className="my-4" />

        <h1 className="text-3xl font-bold mb-6">Edit Food</h1>

        <form className="space-y-6">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Enter name" className="mt-1" />
          </div>

          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input id="quantity" placeholder="Enter quantity" className="mt-1" />
          </div>

          <div>
            <Label>Image</Label>
            <div className="mt-1 border-2 border-dashed border-gray-300 rounded-md p-6 flex justify-center">
              <div className="text-center">
                <div className="mt-1 flex justify-center">
                  <Button variant="outline" className="text-sm bg-transparent">
                    Upload Image
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="expiration">Expiration</Label>
            <Input id="expiration" placeholder="Enter expiration date" className="mt-1" />
          </div>

          <div>
            <Label>Categories</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {["Breakfast", "Lunch", "Dinner", "Snack", "Dessert", "Main", "Veggie", "Starch"].map((category) => (
                <div key={category} className="flex items-center space-x-2">
                  <Checkbox id={`category-${category}`} />
                  <Label htmlFor={`category-${category}`}>{category}</Label>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="placement">Placement</Label>
            <Input id="placement" placeholder="Enter placement" className="mt-1" />
          </div>

          <div>
            <Label htmlFor="keywords">Keywords</Label>
            <Input id="keywords" placeholder="Enter keywords separated by commas ( , )" className="mt-1" />
          </div>

          <Button className="w-full bg-[#528F04] hover:bg-[#3e6b03]">UPDATE PRODUCT</Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full flex items-center justify-center text-red-500 hover:text-red-700"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            DELETE PRODUCT
          </Button>
        </form>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete this product from your pantry.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}