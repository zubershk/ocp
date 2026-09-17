"use client";

import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent } from "@/components/shadcn/card";

export interface ProductCardProps {
  id?: number | string;
  image: string;
  category: string;
  name: string;
  rating: number;
  reviews: number;
  price: number;
  originalPrice?: number;
  badge?: {
    text: string;
  };
  className?: string;
  onAddToCart?: () => void;
  onWishlist?: () => void;
}

export function ProductCard({
  id,
  image,
  category,
  name,
  rating,
  reviews,
  price,
  originalPrice,
  badge,
  className,
  onAddToCart,
  onWishlist,
}: ProductCardProps) {
  const [isWishlisted, setIsWishlisted] = useState(false);

  const getBadgeStyles = (text: string) => {
    const lowercaseText = text.toLowerCase();
    if (lowercaseText.includes("%") || lowercaseText === "sale") {
      return "bg-red-500/10 text-red-500";
    }
    if (lowercaseText === "new") {
      return "bg-blue-500/10 text-blue-500";
    }
    if (lowercaseText === "hot") {
      return "bg-orange-400/10 text-orange-400";
    }
    return "bg-primary/10 text-primary";
  };

  return (
    <Card className={cn("group flex flex-col gap-0 rounded-2xl bg-card p-0 transition-all overflow-hidden ring-0 border w-[270px] h-[410px] shrink-0", className,)}>
      <div className="relative overflow-hidden bg-muted/50 h-[190px] shrink-0">
        {badge && (
          <Badge
            variant="outline"
            className={cn(
              "absolute left-4 top-[22px] z-10 rounded-full border-0 px-2 py-0.5 text-xs capitalize",
              getBadgeStyles(badge.text),
            )}
          >
            {badge.text}
          </Badge>
        )}
        <Button
          size="icon-sm"
          className="group/wishlist absolute right-4 top-4 z-10 size-8 rounded-full bg-background transition-transform hover:scale-110 cursor-pointer"
          onClick={() => {
            setIsWishlisted(!isWishlisted);
            onWishlist?.();
          }}
        >
          <Heart
            className={cn(
              "size-4 transition-all duration-300",
              isWishlisted
                ? "fill-red-500 text-red-500 scale-110"
                : "text-foreground",
            )}
          />
          <span className="sr-only">Add to wishlist</span>
        </Button>
        {id ? (
          <Link to={`/r/menu/item/${id}`} className="block w-full h-full">
            <img
              src={image}
              alt={name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          </Link>
        ) : (
          <img
            src={image}
            alt={name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        )}
      </div>
      <CardContent className="flex flex-col gap-3 p-5 flex-1 min-h-0">
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground capitalize">
            {category}
          </span>
          {id ? (
            <Link to={`/r/menu/item/${id}`} className="hover:text-primary transition-colors">
              <p className="line-clamp-1 text-lg font-medium text-foreground">
                {name}
              </p>
            </Link>
          ) : (
            <p className="line-clamp-1 text-lg font-medium text-foreground">
              {name}
            </p>
          )}
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "h-3.5 w-3.5",
                    i < Math.floor(rating)
                      ? "fill-orange-400 text-orange-400"
                      : "fill-muted text-orange-400",
                  )}
                />
              ))}
            </div>
            <small className="text-sm text-foreground">{rating}</small>
            <small className="text-sm text-foreground">({reviews})</small>
          </div>
          <div className="flex items-center gap-2">
            <small className="text-lg font-medium text-foreground">
              ₹{price}
            </small>
            {originalPrice && (
              <small className="text-lg font-medium text-muted-foreground line-through">
                ₹{originalPrice}
              </small>
            )}
          </div>
        </div>
        <Button
          className="w-full gap-2 h-10 cursor-pointer hover:bg-primary/80 mt-auto shrink-0"
          onClick={onAddToCart}
        >
          Add to Cart
        </Button>
      </CardContent>
    </Card>
  );
}
