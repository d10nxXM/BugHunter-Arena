import { useLocation } from 'react-router';

/** Test stand-in for ResultView: prints the navigation state as JSON (data-testid result-state). */
export default function ResultProbe() {
  const location = useLocation();
  return <pre data-testid="result-state">{JSON.stringify(location.state)}</pre>;
}
