import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="boot">
      <div>
        <h1>Esta página no existe</h1>
        <p><Link to="/">Volver al resumen</Link></p>
      </div>
    </div>
  );
}
