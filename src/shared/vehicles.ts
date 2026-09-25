// Fase 7 (transporte): lo que el servidor y el cliente saben de las barcas y las vagonetas (tipos de
// entidad, medidas, asientos, bits de estado) sin importar nada del juego. Los objetos que las ponen y
// los tipos de vagoneta (con cofre, con horno y los que vengan) están en vehicleItems.ts.

/** Barca y barca con cofre (la madera va en la variante: índice de BOAT_WOODS). */
export const ENT_BOAT = 160;
export const ENT_CHEST_BOAT = 161;
/** Vagonetas. Reservados para las que vendrán: 165 con tolva y 166 con TNT. */
export const ENT_MINECART = 162;
export const ENT_CHEST_MINECART = 163;
export const ENT_FURNACE_MINECART = 164;
export const ENT_HOPPER_MINECART = 165;
export const ENT_TNT_MINECART = 166;

/** Maderas con barca (en este orden va la variante); la de bambú es una balsa. */
export const BOAT_WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak', 'bamboo'] as const;
export type BoatWood = (typeof BOAT_WOODS)[number];
export const RAFT_VARIANT = BOAT_WOODS.indexOf('bamboo');

export const BOAT_WIDTH = 1.375;
export const BOAT_HEIGHT = 0.5625;
export const CART_WIDTH = 0.98;
export const CART_HEIGHT = 0.7;

/** Tipos de vagoneta registrados (los añade vehicleItems.ts; se pueden añadir más). */
const CART_TYPES = new Set<number>([ENT_MINECART, ENT_CHEST_MINECART, ENT_FURNACE_MINECART]);

export function addCartType(type: number): void {
  CART_TYPES.add(type);
}

export const isBoatType = (type: number): boolean => type === ENT_BOAT || type === ENT_CHEST_BOAT;
export const isCartType = (type: number): boolean => CART_TYPES.has(type);
export const isVehicleType = (type: number): boolean => isBoatType(type) || isCartType(type);

/** Plazas: la barca lleva dos; la barca con cofre y la vagoneta, una. */
export function seatsOf(type: number): number {
  return type === ENT_BOAT ? 2 : type === ENT_CHEST_BOAT || type === ENT_MINECART ? 1 : 0;
}

/** Medidas de la caja (ancho, alto). */
export function vehicleSize(type: number): [number, number] {
  return isBoatType(type) ? [BOAT_WIDTH, BOAT_HEIGHT] : [CART_WIDTH, CART_HEIGHT];
}

/** Altura del asiento (donde apoya la cadera el pasajero) sobre la base de la entidad. */
export function seatHeight(type: number): number {
  return isBoatType(type) ? 0.2 : 0.28;
}

/**
 * Desplazamiento hacia delante de cada plaza: con dos pasajeros en una barca, el primero (el que rema)
 * va algo adelantado y el segundo atrás; solo, en el centro.
 */
export function seatOffset(type: number, seat: number, occupied: number): number {
  if (type === ENT_CHEST_BOAT) return 0.15; // delante del cofre
  if (type !== ENT_BOAT || occupied < 2) return 0;
  return seat === 0 ? 0.2 : -0.6;
}

/** Posición de una plaza: [x, y, z] del pasajero (la cadera) para una entidad en (x, y, z) con ese yaw. */
export function seatPos(type: number, x: number, y: number, z: number, yaw: number, seat: number, occupied: number): [number, number, number] {
  const f = seatOffset(type, seat, occupied);
  return [x - Math.sin(yaw) * f, y + seatHeight(type), z - Math.cos(yaw) * f];
}

/** Bits de estado propios (se suman a EF_HURT, recién golpeada): remos que reman y horno encendido. */
export const VF_PADDLE_L = 1 << 24;
export const VF_PADDLE_R = 1 << 25;
export const VF_LIT = 1 << 26;
/** Golpeada hacia el otro lado (la sacudida alterna). */
export const VF_HURT_FLIP = 1 << 27;

/**
 * Posición "de contenedor" de una barca o vagoneta con cofre: la ventana del cofre funciona como la de
 * un cofre de bloque, con unas coordenadas que no existen en el mundo (y por encima del techo) que
 * llevan el id de la entidad.
 */
export const VEHICLE_CONTAINER_Y = 447;

export function vehicleContainerPos(entityId: number): [number, number, number] {
  return [entityId % 1_000_000, VEHICLE_CONTAINER_Y, Math.floor(entityId / 1_000_000)];
}

export function vehicleOfContainer(x: number, y: number, z: number): number {
  return y === VEHICLE_CONTAINER_Y && x >= 0 && z >= 0 ? z * 1_000_000 + x : -1;
}
