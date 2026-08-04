-- =====================================================================
-- 019_carro_cambio.sql — Câmbio (manual/automático) por veículo
--
-- Câmbio é atributo do carro, não da OS. Fica armazenado uma vez e
-- reaproveita nas OSs seguintes. Editável tanto da tela de Clientes
-- quanto direto do modal de detalhe da OS.
-- =====================================================================

CREATE TYPE tipo_cambio AS ENUM ('manual', 'automatico', 'cvt', 'automatizado');

ALTER TABLE carros
    ADD COLUMN cambio tipo_cambio;

COMMENT ON COLUMN carros.cambio IS
    'Tipo de câmbio do veículo. NULL = não informado.';
