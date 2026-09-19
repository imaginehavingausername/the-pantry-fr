import Image from "next/image"

interface FoodItemProps {
  name: string
  imageUrl: string
  quantity: number
  location: string
  expires: string
}

export default function FoodItem({ name, imageUrl, quantity, location, expires }: FoodItemProps) {
  const hasImage = Boolean(imageUrl && imageUrl.trim())

  return (
    <div className="flex items-start p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
      <div className="h-25 w-25 bg-gray-100 rounded-md mr-4 flex items-center justify-center overflow-hidden">
        {hasImage ? (
          <Image
            src={imageUrl}
            alt="Food Item"
            width={96}
            height={96}
            sizes="(max-width: 640px) 80px, 96px"
            className="rounded-md object-cover"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center text-xs font-medium text-gray-500">
            No image
          </div>
        )}
      </div>
      <div>
        <h3 className="font-bold text-lg">{name}</h3>
        <p className="text-black"><span className="font-bold">Quantity:</span> {quantity}</p>
        <p className="text-black"><span className="font-bold">Location:</span> {location}</p>
        {expires && <p className="text-black"><span className="font-bold">Expires:</span> {expires}</p>}
      </div>
    </div>
  )
}
