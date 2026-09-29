const centresService = require('../services/centres.service');

async function list(req, res, next) {
  try {
    const { page, limit } = req.validatedQuery;
    const { centres, pagination } = await centresService.listCentres({ page, limit });
    res.status(200).json({ success: true, data: { centres, pagination } });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const { id } = req.validatedParams;
    const centre = await centresService.getCentreById(id);
    res.status(200).json({ success: true, data: { centre } });
  } catch (err) {
    next(err);
  }
}

async function listTests(req, res, next) {
  try {
    const { id } = req.validatedParams;
    const { page, limit } = req.validatedQuery;
    const { tests, pagination } = await centresService.listTestsByCentre(id, { page, limit });
    res.status(200).json({ success: true, data: { tests, pagination } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const centre = await centresService.createCentre(req.validatedBody);
    res.status(201).json({ success: true, data: { centre } });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.validatedParams;
    const centre = await centresService.updateCentre(id, req.validatedBody);
    res.status(200).json({ success: true, data: { centre } });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.validatedParams;
    await centresService.deleteCentre(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, listTests, create, update, remove };
