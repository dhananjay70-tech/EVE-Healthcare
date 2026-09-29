const testsService = require('../services/tests.service');

async function getById(req, res, next) {
  try {
    const { id } = req.validatedParams;
    const test = await testsService.getTestById(id);
    res.status(200).json({ success: true, data: { test } });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const test = await testsService.createTest(req.validatedBody);
    res.status(201).json({ success: true, data: { test } });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const { id } = req.validatedParams;
    const test = await testsService.updateTest(id, req.validatedBody);
    res.status(200).json({ success: true, data: { test } });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.validatedParams;
    await testsService.deleteTest(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { getById, create, update, remove };
