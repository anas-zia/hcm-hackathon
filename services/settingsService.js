import CompanySettings from '../models/CompanySettings.js';
import AppError from '../utils/AppError.js';

async function getSettings() {
  const settings = await CompanySettings.findOne();
  if (!settings) throw new AppError(409, 'Company is not set up yet');
  return settings;
}

export { getSettings };
