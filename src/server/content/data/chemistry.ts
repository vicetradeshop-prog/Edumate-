/**
 * EduMate — Données de référence (chimie / physique).
 * Valeurs issues du tableau périodique standard (masses molaires en g/mol).
 */

export interface Element {
  symbol: string;
  name: string;
  z: number;
  m: number; // masse molaire atomique (g/mol)
  family: string;
  period: number;
}

export const ELEMENTS: Element[] = [
  { symbol: 'H', name: 'Hydrogène', z: 1, m: 1.0, family: 'Non-métal', period: 1 },
  { symbol: 'He', name: 'Hélium', z: 2, m: 4.0, family: 'Gaz noble', period: 1 },
  { symbol: 'Li', name: 'Lithium', z: 3, m: 6.9, family: 'Métal alcalin', period: 2 },
  { symbol: 'Be', name: 'Béryllium', z: 4, m: 9.0, family: 'Alcalino-terreux', period: 2 },
  { symbol: 'B', name: 'Bore', z: 5, m: 10.8, family: 'Métalloïde', period: 2 },
  { symbol: 'C', name: 'Carbone', z: 6, m: 12.0, family: 'Non-métal', period: 2 },
  { symbol: 'N', name: 'Azote', z: 7, m: 14.0, family: 'Non-métal', period: 2 },
  { symbol: 'O', name: 'Oxygène', z: 8, m: 16.0, family: 'Non-métal', period: 2 },
  { symbol: 'F', name: 'Fluor', z: 9, m: 19.0, family: 'Halogène', period: 2 },
  { symbol: 'Ne', name: 'Néon', z: 10, m: 20.2, family: 'Gaz noble', period: 2 },
  { symbol: 'Na', name: 'Sodium', z: 11, m: 23.0, family: 'Métal alcalin', period: 3 },
  { symbol: 'Mg', name: 'Magnésium', z: 12, m: 24.3, family: 'Alcalino-terreux', period: 3 },
  { symbol: 'Al', name: 'Aluminium', z: 13, m: 27.0, family: 'Métal pauvre', period: 3 },
  { symbol: 'Si', name: 'Silicium', z: 14, m: 28.1, family: 'Métalloïde', period: 3 },
  { symbol: 'P', name: 'Phosphore', z: 15, m: 31.0, family: 'Non-métal', period: 3 },
  { symbol: 'S', name: 'Soufre', z: 16, m: 32.1, family: 'Non-métal', period: 3 },
  { symbol: 'Cl', name: 'Chlore', z: 17, m: 35.5, family: 'Halogène', period: 3 },
  { symbol: 'Ar', name: 'Argon', z: 18, m: 39.9, family: 'Gaz noble', period: 3 },
  { symbol: 'K', name: 'Potassium', z: 19, m: 39.1, family: 'Métal alcalin', period: 4 },
  { symbol: 'Ca', name: 'Calcium', z: 20, m: 40.1, family: 'Alcalino-terreux', period: 4 },
  { symbol: 'Fe', name: 'Fer', z: 26, m: 55.8, family: 'Métal de transition', period: 4 },
  { symbol: 'Cu', name: 'Cuivre', z: 29, m: 63.5, family: 'Métal de transition', period: 4 },
  { symbol: 'Zn', name: 'Zinc', z: 30, m: 65.4, family: 'Métal de transition', period: 4 },
  { symbol: 'Br', name: 'Brome', z: 35, m: 79.9, family: 'Halogène', period: 4 },
  { symbol: 'Ag', name: 'Argent', z: 47, m: 107.9, family: 'Métal de transition', period: 5 },
  { symbol: 'I', name: 'Iode', z: 53, m: 126.9, family: 'Halogène', period: 5 },
];

/** Molécules usuelles : formule brute et masse molaire exacte (g/mol). */
export const MOLECULES: { formula: string; name: string; m: number; composition: Record<string, number> }[] = [
  { formula: 'H2O', name: 'eau', m: 18.0, composition: { H: 2, O: 1 } },
  { formula: 'CO2', name: 'dioxyde de carbone', m: 44.0, composition: { C: 1, O: 2 } },
  { formula: 'O2', name: 'dioxygène', m: 32.0, composition: { O: 2 } },
  { formula: 'N2', name: 'diazote', m: 28.0, composition: { N: 2 } },
  { formula: 'CH4', name: 'méthane', m: 16.0, composition: { C: 1, H: 4 } },
  { formula: 'NH3', name: 'ammoniac', m: 17.0, composition: { N: 1, H: 3 } },
  { formula: 'CO', name: 'monoxyde de carbone', m: 28.0, composition: { C: 1, O: 1 } },
  { formula: 'HCl', name: 'chlorure d’hydrogène', m: 36.5, composition: { H: 1, Cl: 1 } },
  { formula: 'NaCl', name: 'chlorure de sodium', m: 58.5, composition: { Na: 1, Cl: 1 } },
  { formula: 'C2H6O', name: 'éthanol', m: 46.0, composition: { C: 2, H: 6, O: 1 } },
  { formula: 'C6H12O6', name: 'glucose', m: 180.0, composition: { C: 6, H: 12, O: 6 } },
  { formula: 'C3H8', name: 'propane', m: 44.0, composition: { C: 3, H: 8 } },
  { formula: 'H2SO4', name: 'acide sulfurique', m: 98.1, composition: { H: 2, S: 1, O: 4 } },
  { formula: 'CaCO3', name: 'carbonate de calcium', m: 100.1, composition: { Ca: 1, C: 1, O: 3 } },
  { formula: 'NO2', name: 'dioxyde d’azote', m: 46.0, composition: { N: 1, O: 2 } },
  { formula: 'SO2', name: 'dioxyde de soufre', m: 64.1, composition: { S: 1, O: 2 } },
];

/** Unités et conversions exactes utilisées par les exercices. */
export const CONVERSIONS: { from: string; to: string; factor: number; kind: string }[] = [
  { from: 'km', to: 'm', factor: 1000, kind: 'longueur' },
  { from: 'm', to: 'cm', factor: 100, kind: 'longueur' },
  { from: 'cm', to: 'mm', factor: 10, kind: 'longueur' },
  { from: 'm', to: 'mm', factor: 1000, kind: 'longueur' },
  { from: 'kg', to: 'g', factor: 1000, kind: 'masse' },
  { from: 'g', to: 'mg', factor: 1000, kind: 'masse' },
  { from: 't', to: 'kg', factor: 1000, kind: 'masse' },
  { from: 'L', to: 'mL', factor: 1000, kind: 'volume' },
  { from: 'm³', to: 'L', factor: 1000, kind: 'volume' },
  { from: 'h', to: 'min', factor: 60, kind: 'durée' },
  { from: 'min', to: 's', factor: 60, kind: 'durée' },
  { from: 'h', to: 's', factor: 3600, kind: 'durée' },
  { from: 'km/h', to: 'm/s', factor: 1 / 3.6, kind: 'vitesse' },
  { from: 'kJ', to: 'J', factor: 1000, kind: 'énergie' },
  { from: 'kW', to: 'W', factor: 1000, kind: 'puissance' },
];

/** Constantes physiques usuelles du programme. */
export const CONSTANTS = {
  g: 9.81, // intensité de la pesanteur (N/kg)
  c: 3.0e8, // célérité de la lumière dans le vide (m/s)
  R: 8.314, // constante des gaz parfaits (J/mol/K)
  Na: 6.022e23, // nombre d'Avogadro (mol⁻¹)
};
