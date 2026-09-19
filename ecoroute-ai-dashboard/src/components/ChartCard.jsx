import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts'

const tooltipStyle = { background: '#111a2b', border: '1px solid #26334b', borderRadius: 10, color: '#e8eef9' }

export function TrafficChart({ data }) {
  return <ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
    <defs><linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5b8cff" stopOpacity={0.28}/><stop offset="100%" stopColor="#5b8cff" stopOpacity={0}/></linearGradient></defs>
    <CartesianGrid stroke="#202b40" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="time" stroke="#6d7c95" tickLine={false} axisLine={false} fontSize={11}/><YAxis stroke="#6d7c95" tickLine={false} axisLine={false} fontSize={11}/><Tooltip contentStyle={tooltipStyle}/>
    <Area type="monotone" dataKey="rps" stroke="#6d96ff" strokeWidth={2.5} fill="url(#trafficFill)" name="RPS"/>
  </AreaChart></ResponsiveContainer>
}

export function ResponseChart({ data }) {
  return <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
    <CartesianGrid stroke="#202b40" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="time" stroke="#6d7c95" tickLine={false} axisLine={false} fontSize={11}/><YAxis stroke="#6d7c95" tickLine={false} axisLine={false} fontSize={11}/><Tooltip contentStyle={tooltipStyle}/>
    <Line type="monotone" dataKey="latency" stroke="#a77bff" strokeWidth={2.5} dot={false} name="Latency (ms)"/>
  </LineChart></ResponsiveContainer>
}

export function PredictionChart({ data }) {
  return <ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
    <CartesianGrid stroke="#202b40" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="time" stroke="#6d7c95" tickLine={false} axisLine={false} fontSize={11}/><YAxis stroke="#6d7c95" tickLine={false} axisLine={false} fontSize={11}/><Tooltip contentStyle={tooltipStyle}/>
    <Line type="monotone" dataKey="actual" stroke="#67d8a4" strokeWidth={2.5} dot={false} name="Actual RPS"/>
    <Line type="monotone" dataKey="predicted" stroke="#ffb454" strokeWidth={2.5} strokeDasharray="6 5" dot={false} name="Predicted RPS"/>
  </LineChart></ResponsiveContainer>
}
