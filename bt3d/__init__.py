"""bt3d — el BT3D de conjunto: el optimizador por instante sobre la sombra 3D real.

Fase 0: parámetros declarados (un solo fichero, audit5/bt3d_parametros.json,
que lee también el lado JS), la escena que escribe el lado JS, el rango de mando
por unidad (copia de `rangoHaz` del simulador, careada), el enumerador por
envolvente de rotación y la estructura del grafo de unidades.

Solo biblioteca estándar: sin numpy, para que el banco corra en cualquier
máquina y en CI sin instalar nada.
"""
