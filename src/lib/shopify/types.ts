export type PageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

export type SelectedOption = {
  name: string;
  value: string;
};

export type ShopifyVariantNode = {
  id: string;
  title: string;
  sku: string | null;
  selectedOptions: SelectedOption[];
};

export type ShopifyLineNode = {
  id: string;
  title: string;
  name: string;
  sku: string | null;
  quantity: number;
  unfulfilledQuantity: number;
  variantTitle: string | null;
  variant: { id: string } | null;
};

export type ShopifyOrderNode = {
  id: string;
  name: string;
  createdAt: string;
  displayFulfillmentStatus: string;
  lineItems: {
    pageInfo: PageInfo;
    nodes: ShopifyLineNode[];
  };
};

export type ShopifyProductNode = {
  id: string;
  title: string;
  handle: string;
  status: string;
  variants: {
    pageInfo: PageInfo;
    nodes: ShopifyVariantNode[];
  };
};

export type OpenOrdersData = {
  orders: {
    pageInfo: PageInfo;
    nodes: ShopifyOrderNode[];
  };
};

export type OrderLineItemsData = {
  order: {
    lineItems: {
      pageInfo: PageInfo;
      nodes: ShopifyLineNode[];
    };
  } | null;
};

export type ProductsData = {
  products: {
    pageInfo: PageInfo;
    nodes: ShopifyProductNode[];
  };
};

export type ProductVariantsData = {
  product: {
    variants: {
      pageInfo: PageInfo;
      nodes: ShopifyVariantNode[];
    };
  } | null;
};
