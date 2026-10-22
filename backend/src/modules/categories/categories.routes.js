import { Router } from 'express';
import { validate } from '../../middlewares/validate.js';
import { idParamsSchema } from '../../utils/schemas.js';
import { createCategorySchema, listCategoriesQuery, updateCategorySchema } from './categories.schemas.js';
import * as service from './categories.service.js';

export function categoriesRoutes() {
  const router = Router();

  router.get('/', validate({ query: listCategoriesQuery }), async (req, res) => {
    res.json({ data: await service.list(req.user.id, req.valid.query) });
  });

  router.post('/', validate({ body: createCategorySchema }), async (req, res) => {
    res.status(201).json({ data: await service.create(req.user.id, req.valid.body) });
  });

  router.get('/:id', validate({ params: idParamsSchema }), async (req, res) => {
    res.json({ data: await service.getById(req.user.id, req.valid.params.id) });
  });

  router.put('/:id', validate({ params: idParamsSchema, body: updateCategorySchema }), async (req, res) => {
    res.json({ data: await service.update(req.user.id, req.valid.params.id, req.valid.body) });
  });

  router.delete('/:id', validate({ params: idParamsSchema }), async (req, res) => {
    await service.remove(req.user.id, req.valid.params.id);
    res.status(204).end();
  });

  return router;
}
